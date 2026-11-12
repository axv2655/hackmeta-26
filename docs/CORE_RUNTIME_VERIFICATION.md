# Core runtime verification

How to reproduce the core-backend acceptance run, and what it does and does not prove.

```bash
cd backend
uv run python scripts/check_core_live.py --port 8765
```

The script owns a fresh temporary SQLite database and uploads directory, seeds the
core world, starts its own `uvicorn`, and stops it on success or failure. It refuses
an occupied port and never touches `backend/data/app.db`. It does not use TestClient
or any test fixture. Reports are written under the printed temp directory.

## What it checks

| Area | Evidence |
| --- | --- |
| HTTP contract and privacy | The Postman v3 collection `postman/collections/core-smoke` (75 requests, 107 assertions): health, invalid auth, picker, settings, Circle ownership/edit/delete, audience preview, Marks and saves, Move create/join/arrive/leave/end and everyone-left, multipart upload, two-tag approval and withdrawal, block-after-load, both media URLs, seed media, traversal attempts. Assertions check exact statuses and privacy failures, not just 2xx. |
| Real events | One real WebSocket per user alongside the run: audience members receive `move.created`, `participant.changed`, `moment.added`, `moment.approval_needed`, `move.ended`; a blocked user and strangers receive nothing about the Move; a reconnect plus refetch shows the ended Move. |
| Scheduler | One Move and its participant rows are backdated 4 hours in the isolated DB; the real scheduler ends it within 70 seconds. A Move with recent participant activity stays live. No production test-clock endpoint exists. |
| Persistence | The server is restarted on the same database; the Move state is identical and seed media still serves. |
| Offline seed imagery | The server runs with unreachable proxies; Mark and Moment imagery is served from the packaged files and no response contains an external image URL. |

## Postman CLI notes (1.88.0)

- Local runs need no login, no workspace and no `postman init`; cloud reporting is not used.
- The CLI exits 1 for an expected HTTP 404 even when its assertion passed, so the script
  does **not** trust the exit code. It parses `*.collection-run-summary.yaml` and requires
  every request to run, zero request errors and zero failed assertions.
- The CLI does not resolve relative `formdata` file sources, so the script passes the
  upload fixture as `--env-var fixture_png=<absolute path>`.
- The environment file is `core-local.environment.yaml` (the CLI's naming) with only
  `base_url`, the seeded demo ids, and the fixture path.

## Not proven here

Muse failure simulation, Surfaces hooks and endpoints, the Notifier, the frontend and
phone interactions, durable event delivery, multi-worker fan-out and real authentication.
Foreign lanes run as the normal null ports. For Z1, carry forward: proximity before notify,
no duplicate nudge during nested autojoin hooks, creator-edited notify exclusions,
hangout/rating creation on end, and client recovery from an event arriving before the HTTP
create response.
