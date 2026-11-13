# ruff: noqa: E501
"""Real-server acceptance run for the core backend.

    uv run python scripts/check_core_live.py --port 8765

Owns everything it touches: a fresh temporary SQLite database and uploads
directory, a seeded world, and its own uvicorn process, all removed (or at
least stopped) on success or failure. It refuses a port that is already in
use. It never imports test fixtures and never uses TestClient: requests come
from the Postman CLI collection in `postman/collections/core-smoke`, events
from real WebSocket clients, and the scheduler is observed live.

Foreign lanes stay the normal null ports, so this is core evidence only, not
Muse failure simulation or full lane integration.
"""

import argparse
import asyncio
import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime, timedelta
from pathlib import Path

import websockets
import yaml

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
COLLECTION = REPO / "postman" / "collections" / "core-smoke"
ENVIRONMENT = REPO / "postman" / "environments" / "core-local.environment.yaml"
FIXTURE = REPO / "postman" / "fixtures" / "moment.png"
USERS = ("anish", "tony", "dev", "priya", "maya", "mom", "jordan")
API = "/api/v1"
FAILURES: list[str] = []


def check(ok: bool, label: str) -> None:
    print(f"  {'ok  ' if ok else 'FAIL'} {label}")
    if not ok:
        FAILURES.append(label)


def port_in_use(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


class Server:
    def __init__(self, port: int, workdir: Path) -> None:
        self.port, self.workdir = port, workdir
        self.proc: subprocess.Popen | None = None
        # Unreachable proxies: any attempt to reach an external host fails.
        self.env = {
            **os.environ,
            "DB_PATH": str(workdir / "app.db"),
            "MEDIA_DIR": str(workdir / "uploads"),
            "HTTP_PROXY": "http://127.0.0.1:9",
            "HTTPS_PROXY": "http://127.0.0.1:9",
            "http_proxy": "http://127.0.0.1:9",
            "https_proxy": "http://127.0.0.1:9",
            "NO_PROXY": "",
        }

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def seed(self) -> None:
        subprocess.run(
            [sys.executable, "-m", "app.seed.seed"],
            cwd=BACKEND,
            env=self.env,
            check=True,
            capture_output=True,
        )

    def start(self) -> None:
        log = open(self.workdir / "server.log", "ab")
        self.proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(self.port),
            ],
            cwd=BACKEND,
            env=self.env,
            stdout=log,
            stderr=log,
        )
        for _ in range(100):
            try:
                if http("GET", f"{self.base}{API}/health")[0] == 200:
                    return
            except OSError:
                pass
            if self.proc.poll() is not None:
                raise RuntimeError("server exited; see server.log")
            time.sleep(0.2)
        raise RuntimeError("server did not become healthy")

    def stop(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None


def http(method: str, url: str, user: str | None = None, body=None):
    req = urllib.request.Request(url, method=method)
    if user:
        req.add_header("X-User-Id", f"u_{user}")
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, data, timeout=10) as res:
            return res.status, res.read(), {k.lower(): v for k, v in res.headers.items()}
    except urllib.error.HTTPError as err:
        return err.code, err.read(), {k.lower(): v for k, v in err.headers.items()}


def jget(server: Server, path: str, user: str):
    status, raw, _ = http("GET", f"{server.base}{API}{path}", user)
    return status, (json.loads(raw) if raw else None)


class Observers:
    """One real WebSocket per user, collecting every event until stopped."""

    def __init__(self, server: Server) -> None:
        self.server = server
        self.events: dict[str, list[dict]] = {u: [] for u in USERS}
        self.tasks: list[asyncio.Task] = []
        self.ready = 0

    async def _listen(self, user: str) -> None:
        url = f"ws://127.0.0.1:{self.server.port}{API}/ws?user_id=u_{user}"
        async with websockets.connect(url, proxy=None) as ws:
            self.ready += 1
            async for message in ws:
                self.events[user].append(json.loads(message))

    async def start(self) -> None:
        self.tasks = [asyncio.create_task(self._listen(u)) for u in USERS]
        for _ in range(50):
            if self.ready == len(USERS):
                return
            await asyncio.sleep(0.1)
        raise RuntimeError("WebSocket clients did not connect")

    async def stop(self) -> None:
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    def types(self, user: str, move_id: str | None = None) -> list[str]:
        out = []
        for event in self.events[user]:
            data = event.get("data", {})
            if (
                move_id is None
                or data.get("move_id") == move_id
                or data.get("id") == move_id
            ):
                out.append(event.get("type", ""))
        return out


async def run_postman(server: Server, report_dir: Path) -> int:
    cmd = [
        "postman",
        "collection",
        "run",
        str(COLLECTION),
        "-e",
        str(ENVIRONMENT),
        "--env-var",
        f"base_url={server.base}",
        "--env-var",
        f"fixture_png={FIXTURE}",
        "--output",
        str(report_dir),
    ]
    env = {**os.environ}  # CLI talks to localhost; keep it independent of proxies
    proc = await asyncio.create_subprocess_exec(
        *cmd, env=env, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
    )
    out, _ = await proc.communicate()
    (report_dir / "postman-console.txt").write_bytes(out)
    return proc.returncode or 0


def verify_postman(report_dir: Path) -> None:
    """Judge the structured report, not the exit code: CLI 1.88.0 exits 1 for
    an expected HTTP 404 even when its assertion passed. Transport errors and
    any failed assertion still fail the run."""
    summary = next(report_dir.glob("*collection-run-summary.yaml"))
    stats = yaml.safe_load(summary.read_text())["stats"]
    expected = len(list(COLLECTION.rglob("*.request.yaml")))
    ran = stats["executedRequests"]
    tests = stats["tests"]
    check(
        ran["executed"] == expected,
        f"Postman ran all {expected} requests ({ran['executed']})",
    )
    check(ran["errors"] == 0, f"no transport/request errors ({ran['errors']})")
    check(
        tests["failed"] == 0,
        f"no failed assertions ({tests['failed']} of {tests['executed']})",
    )
    check(
        tests["executed"] >= expected,
        f"at least one assertion per request ({tests['executed']})",
    )


def scalar(db: Path, sql: str, *args):
    with sqlite3.connect(db) as con:
        row = con.execute(sql, args).fetchone()
    return row[0] if row else None


def stamp(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%d %H:%M:%S.%f")  # naive UTC, as stored


def verify_events(obs: Observers, db: Path) -> str:
    move_id = scalar(db, "select id from moves where text='probe: matcha run'")
    check(bool(move_id), "main probe Move exists in the database")
    for user in ("anish", "tony", "priya"):
        types = obs.types(user, move_id)
        check("move.created" in types, f"{user} received move.created")
    check("move.ended" in obs.types("tony", move_id), "tony received move.ended")
    check(
        "participant.changed" in obs.types("anish", move_id),
        "anish received participant.changed",
    )
    check(
        "moment.added" in obs.types("anish", move_id),
        "participants received moment.added",
    )
    check(
        any(e["type"] == "moment.approval_needed" for e in obs.events["tony"]),
        "tagged tony received moment.approval_needed",
    )
    for hidden in ("mom", "jordan", "maya"):
        seen = obs.types(hidden, move_id)
        check(
            seen == [],
            f"{hidden} (blocked/stranger) received nothing about the Move ({seen})",
        )
    leaked = [
        e
        for u in ("mom", "jordan", "maya")
        for e in obs.events[u]
        if "media_url" in json.dumps(e) or "probe" in json.dumps(e)
    ]
    check(not leaked, "hidden users' sockets carry no Move or Moment content")
    return move_id


async def reconnect_refetch(server: Server, move_id: str) -> None:
    url = f"ws://127.0.0.1:{server.port}{API}/ws?user_id=u_tony"
    async with websockets.connect(url, proxy=None):
        pass  # drop and come back
    async with websockets.connect(url, proxy=None):
        status, move = jget(server, f"/moves/{move_id}", "tony")
        check(
            status == 200 and move["status"] == "ended",
            "after reconnect a refetch shows the ended Move",
        )


def scheduler_check(server: Server, db: Path) -> None:
    idle = scalar(db, "select id from moves where text='probe: idle'")
    active = scalar(db, "select id from moves where text='probe: active'")
    check(bool(idle and active), "scheduler probe Moves exist")
    old = stamp(datetime.now(UTC) - timedelta(hours=4))
    with sqlite3.connect(db, timeout=10) as con:
        for move_id in (idle, active):
            con.execute("update moves set starts_at=? where id=?", (old, move_id))
        con.execute(
            "update move_participants set joined_at=?, arrived_at=null, left_at=null where move_id=?",
            (old, idle),
        )
        # active: creator row is old but tony joined moments ago (left as written)
        con.execute(
            "update move_participants set joined_at=?, arrived_at=null where move_id=? and user_id='u_anish'",
            (old, active),
        )
    deadline = time.time() + 70
    state = None
    while time.time() < deadline:
        state = jget(server, f"/moves/{idle}", "anish")[1]["status"]
        if state == "ended":
            break
        time.sleep(2)
    check(state == "ended", "the real scheduler ended the idle Move within 70s")
    check(
        jget(server, f"/moves/{active}", "anish")[1]["status"] == "live",
        "a Move with recent participant activity stays live",
    )


def persistence_and_offline(server: Server, move_id: str) -> None:
    before = jget(server, f"/moves/{move_id}", "anish")[1]
    server.stop()
    server.start()
    after = jget(server, f"/moves/{move_id}", "anish")[1]
    check(
        before == after,
        "state is identical after a server restart on the same database",
    )
    status, body, moment_headers = http(
        "GET", f"{server.base}/media/mo_last_night_sunset.png", "anish"
    )
    check(
        status == 200 and body[:4] == b"\x89PNG",
        "seed Moment bytes are served after restart",
    )
    status, body, _ = http("GET", f"{server.base}/media/seed/marks/coffee.png")
    check(
        status == 200 and body[:4] == b"\x89PNG",
        "seed Mark image served with no network",
    )
    # Every URL the API hands out for seed imagery is a local path.
    payload = json.dumps(
        [
            jget(
                server, "/marks/nearby?lat=32.9857&lng=-96.7502&radius_km=10", "anish"
            )[1],
            jget(server, "/moves/feed", "anish")[1],
            jget(server, "/moves/mv_last_night/moments", "anish")[1],
        ]
    )
    check(
        not re.search(r"https?://|picsum", payload),
        "no external image URL in Marks, feed or Moments",
    )
    check(
        moment_headers.get("cache-control") == "private, no-store",
        "protected media is not cacheable",
    )


async def main(port: int) -> int:
    if port_in_use(port):
        print(f"port {port} is already in use; refusing to start", file=sys.stderr)
        return 2
    workdir = Path(tempfile.mkdtemp(prefix="core-live-"))
    report_dir = workdir / "reports"
    report_dir.mkdir()
    server = Server(port, workdir)
    obs = Observers(server)
    print(f"workdir: {workdir}\nreports: {report_dir}")
    try:
        server.seed()
        server.start()
        print("WebSockets + Postman collection")
        await obs.start()
        code = await run_postman(server, report_dir)
        await asyncio.sleep(1.0)  # let the last events drain
        print(f"  (postman exit code {code}; the structured report decides)")
        verify_postman(report_dir)
        move_id = verify_events(obs, workdir / "app.db")
        await obs.stop()
        print("reconnect and refetch")
        await reconnect_refetch(server, move_id)
        print("scheduler (real, up to 70s)")
        await asyncio.to_thread(scheduler_check, server, workdir / "app.db")
        print("restart persistence, offline seed imagery")
        await asyncio.to_thread(persistence_and_offline, server, move_id)
    except Exception as exc:  # report the failed expectation clearly
        FAILURES.append(f"unexpected error: {exc!r}")
        print(f"  FAIL unexpected error: {exc!r}")
    finally:
        await obs.stop()
        server.stop()
    print(f"\nreports kept at {report_dir}")
    print("RESULT:", "FAILED" if FAILURES else "ALL CHECKS PASSED")
    if FAILURES:
        print("\n".join(f" - {f}" for f in FAILURES))
        return 1
    shutil.rmtree(workdir / "uploads", ignore_errors=True)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    sys.exit(asyncio.run(main(parser.parse_args().port)))
