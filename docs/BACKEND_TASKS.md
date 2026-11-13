# Backend task plan: three independent lanes

Companion to [ARCHITECTURE.md](../ARCHITECTURE.md). That file says *what* to build; this one says *who builds which slice* so three people (or their Claude agents) can work at the same time without blocking or breaking each other's tests.

Every task here is also a GitHub issue (linked in the tables) written so an agent can pick it up cold.

## 1. How the work is split

| Lane | Person | Owns (writes) | Ships |
| --- | --- | --- | --- |
| **Core** (`lane:core`) | Person 1 | Move lifecycle, privacy, marks, circles, users, moments, WebSocket hub, core seed | The trusted spine: who can see what, state changes, realtime |
| **Muse** (`lane:muse`) | Person 2 | `muse/**`, notify pipeline, notifications, suggestions, taste, pseudo-groups, Muse scheduler jobs | Every AI judgment, with a fallback for each |
| **Surfaces** (`lane:surfaces`) | Person 3 | Proximity, Reels, calendar, ratings, leaderboards, hangouts, glasses, demo control, history seed | Everything that surrounds a Move, plus the demo panel |

This is ARCHITECTURE.md section 17 collapsed from five lanes to three, backend only. Frontend lanes C, D, E from that section stay separate.

Task IDs: `T0` shared, `C*` core, `M*` muse, `S*` surfaces, `Z1` integration.

## 2. Why the lanes do not collide

1. **One shared, frozen contract (T0).** Tables, ports, hooks and the empty route stubs are created once, reviewed by all three, then frozen. After that nobody edits `main.py`, `ports.py`, `hooks.py` or `tables/`.
2. **Write ownership per table.** A lane writes only its own tables. Reading any table is fine. Table split is in T0. One exception, seed only: `seed/history.py` (surfaces, S11) inserts the ended `moves` and `move_participants` rows behind the 8 weeks of history, without firing hooks.
3. **Behavior crosses lanes only through ports** (section 3). Every port has a safe null implementation, so any lane runs alone.
4. **Each lane wires itself in one file:** `app/lanes/<lane>.py`. No shared registration list. T0 creates the file; after T0 merges, every task in that lane appends its own registration lines to it. The same goes for the lane's `app/models/<lane>.py`, `tests/<lane>/fakes.py` and `tests/<lane>/factories.py`.
5. **Lifecycle hooks instead of calls.** Core fires `on_move_created/joined/ended`; Muse and Surfaces subscribe. Core never imports them.

### Module map (used by the lane-isolation test)

| Lane | Source files |
| --- | --- |
| core | `core/*`, `domain/{moves,privacy,errors}.py`, `repositories/{moves,marks,audience}.py`, `services/{moves,marks,audience,users,circles,moments}.py`, `realtime/*`, `seed/core.py`, `models/core.py`, routes `{auth,users,circles,audience,marks,moves,moments,ws}.py`, `lanes/core.py` |
| muse | `muse/*`, `domain/{affinity,pseudo_groups}.py`, `services/{notify,suggestions,taste}.py`, `seed/muse.py`, `models/muse.py`, routes `{muse,muse_compose,muse_spots,notifications,suggestions,pseudo_groups}.py`, `lanes/muse.py` |
| surfaces | `domain/ranking.py`, `services/{proximity,proximity_sweep,open_moves,reels,calendar,ratings,leaderboards,hangouts,glasses,demo}.py`, `mcp/**` (the `/mcp` connector), `seed/{surfaces,history}.py`, `models/surfaces.py`, routes `{proximity,proximity_prompt,reels,calendar,ratings,leaderboards,glasses,demo}.py`, `lanes/surfaces.py` |

`tests/contract/test_lane_isolation.py` fails if one lane imports another's files. Importing `app.ports`, `app.tables`, `app.hooks`, `app.core`, `app.container`, `app.models.shared`, `app.api.deps`, `app.seed.ids` is always allowed.

## 3. The contract (created by T0)

The frozen executable contract is `backend/app/ports.py`. The outline below is illustrative; consumers must use its exact annotations and await all MoveGateway mutations. TimeControl, UserGateway and MarkGateway.unsave are also part of that contract.

**Flare removal needs a contract amendment (rule 4.8, all three owners approve, one PR, every lane's fakes updated).** Already-merged `ports.py` still carries `MuseGateway.run_flare_scan`, `run_free_time_scan`, `MarkGateway.mark_flared`, `FreeWindow` and `CalendarGateway`, plus the `moves.kind` / `moves.fill_deadline` / `saved_marks.flared_at` columns and the `flare` / `free_time` suggestion types. The outline below shows the target state. Until the amendment lands, nothing may call the removed members.

```python
# app/ports.py
class Clock(Protocol):            # impl: core C1 (null impl: system time, setters are no-ops)
    def now(self) -> datetime: ...
    def set_time(self, iso: str | None) -> None: ...   # None clears the demo offset
    def shift(self, minutes: int) -> None: ...
class EventPublisher(Protocol):   async def publish(self, user_ids: Iterable[str], type: str, data: dict) -> None: ...   # impl: core C9
class Notifier(Protocol):         async def send(self, user_id: str, type: str, title: str, body: str, data: dict) -> str: ...  # impl: muse M4

class MoveGateway(Protocol):      # impl: core C4. create/add_participant/end run through MoveService:
                                  # they publish the same events and fire the same hooks as the HTTP routes.
    def get(self, move_id: str) -> MoveSnapshot | None: ...
    def audience_ids(self, move_id: str) -> frozenset[str]: ...
    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]: ...
    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot: ...  # MoveCreate carries notify_user_ids
    async def add_participant(self, move_id: str, user_id: str, status: str, joined_via: str) -> None: ...
    async def end(self, move_id: str, reason: str) -> None: ...
    async def end_stale(self) -> list[str]: ...

class MarkGateway(Protocol):      # impl: core C6
    def get(self, mark_id: str) -> MarkSnapshot | None: ...
    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]: ...
    def save(self, user_id: str, mark_id: str, source: str, source_ref: str | None) -> None: ...

class MuseGateway(Protocol):      # impl: muse. One class in M1 (muse/gateway.py); each method is bound by the task that builds it.
    async def compose_move(self, user_id: str, mark_id: str | None, seed_text: str | None) -> MoveDraftOut: ...
    async def notify_move(self, move_id: str, force_ids: set[str], drop_ids: set[str]) -> list[NotifyPickOut]: ...
    async def notify_preview(self, creator_id: str, mark_id: str | None, text: str, circle_ids: list[str], user_ids: list[str]) -> list[NotifyPickOut]: ...   # draft not posted yet
    async def rank_moves(self, viewer_id: str, moves: list[MoveSnapshot]) -> list[RankedMove]: ...
    async def resolve_place(self, user_id: str, geotag_mark_id: str | None, caption: str | None, coarse: tuple[float, float] | None) -> PlaceResolution: ...
    async def parse_intent(self, utterance: str) -> Intent: ...
    async def run_revive_scan(self, user_id: str) -> SuggestionSnapshot | None: ...
    async def run_nobody_bit(self, move_id: str) -> SuggestionSnapshot | None: ...
    async def run_route(self, move_id: str, user_ids: list[str]) -> SuggestionSnapshot | None: ...
    def muse_stats(self) -> dict: ...

class ProximityGateway(Protocol): # impl: surfaces S1
    def copresent_cluster(self, user_id: str) -> frozenset[str]: ...
    def open_moves_near(self, user_id: str) -> list[str]: ...

# CalendarGateway / FreeWindow: removed with the flare agent. M7 was the only consumer.
```

```python
# app/hooks.py  (handlers run in registration order; one handler failing never breaks another)
on_move_created(move_id, notify_user_ids)  # core fires; surfaces: proximity sweep (S2); muse: notify pipeline (M4)
                              # notify_user_ids: frozenset[str] | None = the creator's confirmed notify list
                              # from POST /moves. None means Muse picks freely.
on_move_joined(move_id, uid)  # core fires; muse: second-order nudge (M4)
on_move_ended(move_id)        # core fires; surfaces: hangouts + rating prompt (S8)
on_rating_submitted(move_id, uid)  # surfaces fires; muse: taste update (M8)
```

Who implements which port, who consumes it:

| Port | Implemented by | Consumed by |
| --- | --- | --- |
| `Clock`, `EventPublisher` | core | all |
| `Notifier` | muse | core (C4, C8), surfaces (S2, S8) |
| `MoveGateway`, `MarkGateway` | core | muse (M4, M5, M6, M7, M8, M10), surfaces (S2, S3, S4, S8, S9, S10) |
| `MuseGateway` | muse | core (C5), surfaces (S4, S9, S10) |
| `ProximityGateway` | surfaces | muse (M4, M10) |
| `CalendarGateway` | none (removed) | none |

## 4. Test independence rules

These are what keeps one person's red test from becoming another person's problem.

1. **Tests live in the lane's own folder:** `backend/tests/{core,muse,surfaces}/`. Run a lane with `uv run pytest tests/<lane> tests/contract`.
2. **Fake foreign ports locally.** Each lane keeps its own `fakes.py`. No shared fakes, so a bug in one lane's fake cannot mask or break another's tests.
3. **Fresh state per test:** function-scoped in-memory SQLite, data built by the lane's `factories.py`. No module-level state, no test order dependence.
4. **Never use the seed** in service/route tests (only the seed's own tests do). Seed changes must not break unrelated tests.
5. **No network, no real Muse, no wall clock.** Use `FakeMuseClient` and an injected `Clock`.
6. **No cross-lane imports** (enforced by the isolation test).
7. **Integration is separate** (`tests/integration/`, task Z1). It runs after merges, is owned by everyone together, and is not a merge gate for a lane.
8. **Contract changes** (`ports.py`, `hooks.py`, `tables/`) go through an issue all three approve, then land in one PR that also updates every lane's fakes.

## 5. Order of work

```text
T0 (about an hour, all three review) ──┬─▶ Core:     C1 → C2,C3 → C4 → C5,C6   (C7, C9, C10 any time after C1; C8, C11 later)
                                       ├─▶ Muse:     M1 → M2 → M3 → M4 → M5,M6 → M7 → M8,M9,M10 → M11
                                       └─▶ Surfaces: S1,S4,S5,S6,S8,S10,S11 start immediately → S2,S7 → S3,S9
                                                              ▼
                                                  Z1 integration (everyone, after M4)
```

Dependencies inside a lane are listed per task. There are **no dependencies between lanes except T0**. Nobody waits on another person's implementation, only on T0.

## 6. Working with Claude agents

- Each issue is self-contained: owned files, build list, acceptance, tests, ground rules. To have an agent take one, comment `@claude please implement this issue` (requires the Claude GitHub app / Claude Code GitHub Action installed on the repo: run `/install-github-app` in Claude Code), or paste the issue URL into a local Claude Code session.
- One agent per issue, one PR per issue, branch `<lane>/<task-id>-name`. Agents in different lanes can run at the same time because their file sets are disjoint.
- Labels: `lane:core`, `lane:muse`, `lane:surfaces`, `lane:shared`; priority `P0/P1/P2`; milestone `ms:M0` to `ms:M6` (ARCHITECTURE.md 17.1). Filter by your lane label to see your backlog.

Every issue ends with the same ground rules:

### Ground rules (apply to every task)
- Read `ARCHITECTURE.md` (sections 1 to 5 and the sections cited above) and `docs/BACKEND_TASKS.md`.
- Edit ONLY the files listed under "You own", plus your lane's shared files. T0 creates these and every task in the lane appends to them (keep edits small; never rewrite another task's lines): `backend/app/lanes/<lane>.py` (register your ports, hook handlers and scheduler jobs), `backend/app/models/<lane>.py` (your request/response models), `backend/tests/<lane>/fakes.py` and `backend/tests/<lane>/factories.py`.
- Never edit another lane's files, `ports.py`, `hooks.py`, `tables/`, `models/shared.py`, `api/deps.py` or `api/main.py` (T0 owns them; changes need an issue all three lane owners approve).
- You may read any table. You may WRITE only your lane's tables. Anything that needs another lane's behavior goes through a port in `app/ports.py`.
- Tests: only in `backend/tests/<lane>/`. Use a fresh in-memory SQLite per test, build data with your own `factories.py`, fake other lanes' ports in your own `fakes.py`. Never depend on the seed, test order, the real Muse API, the wall clock, or another lane's code.
- Done = `cd backend && uv run pytest tests/<lane> tests/contract && uv run ruff check .` pass, the feature works with every other lane absent (null ports) and with Muse unavailable.
- Branch `<lane>/<task-id>-short-name`, one PR per issue, PR body says `Closes #<this issue>`.

## 7. Open items

- **Muse API shape**: verified by M1 on 2026-11-12 with live calls.
  - Anthropic Messages-compatible: `POST https://api.meta.ai/v1/messages`, header `Authorization: Bearer <MUSE_API_KEY>`, `anthropic-version: 2023-06-01`. Initial live verification used `muse-wonder-1.0`. The project now defaults to `muse-spark-1.3` to reduce cost; Spark access still needs verification with the deployment's key.
  - No JSON mode; asking for "only a JSON object" in the system prompt returns clean JSON. The runner still extracts and validates.
  - **Thinking is always on and cannot be disabled** (`thinking.type=disabled` is a 400; `budget_tokens` must be at least 1024). The response starts with a `redacted_thinking` block, and thinking tokens (about 100 to 300) count against `max_tokens`. A 50-token cap returned no text. `HttpMuseClient` adds `THINKING_HEADROOM = 1024` on top of each agent's cap (the 10.12 caps describe the answer only).
  - Vision works: an inline base64 image is read correctly; a URL image works only if Muse can download it (Wikimedia refused). `MUSE_VISION_MODEL` unset keeps the text-only paths.
  - Latency about 1.3 to 2.5 s per call, well inside the 6 s runner timeout.
  - Config lives in `backend/.env` (`MUSE_BASE_URL`, `MUSE_API_KEY`, `MUSE_MODEL`); without a key, or with `DEMO_MODE=offline`, the lane uses `FakeMuseClient` and every agent falls back.
- **Pairwise ranking algorithm:** the team supplies it; S6 ships a placeholder behind `domain/ranking.py`.
- Section 12.5 privacy pass and M6 demo hardening are scheduled after M4 and are not tasks yet.

# Task index

## Shared foundation (T0)

| ID | Task | Pri | Milestone | Depends on | Issue |
| --- | --- | --- | --- | --- | --- |
| T0 | Contract freeze: tables, ports, hooks, lane scaffolding | P0 | M0 | - | [#1](https://github.com/axv2655/hackmeta-26/issues/1) |
| Z1 | Cross-lane integration smoke tests (run only after lanes merge) | P0 | M6 | T0 | [#35](https://github.com/axv2655/hackmeta-26/issues/35) |

## Lane 1: Core (Move lifecycle, privacy, realtime, seed world)

| ID | Task | Pri | Milestone | Depends on | Issue |
| --- | --- | --- | --- | --- | --- |
| C1 | DB engine, session, Clock with demo offset, config | P0 | M0 | T0 | [#2](https://github.com/axv2655/hackmeta-26/issues/2) |
| C2 | Privacy domain: can_see, audience resolution, audience preview | P0 | M1 | T0, C1 | [#3](https://github.com/axv2655/hackmeta-26/issues/3) |
| C3 | Move domain state machine and SQL repository | P0 | M1 | T0, C1, C2 | [#4](https://github.com/axv2655/hackmeta-26/issues/4) |
| C4 | MoveService: create/join/arrive/leave/end, MoveGateway, hooks | P0 | M1 | T0, C1, C2, C3 | [#5](https://github.com/axv2655/hackmeta-26/issues/5) |
| C5 | Moves routes: create, detail, join/arrive/leave/end, feed, nearby | P0 | M1 | T0, C4 | [#6](https://github.com/axv2655/hackmeta-26/issues/6) |
| C6 | Marks: nearby, search, create, detail, save, MarkGateway | P0 | M1 | T0, C1, C3 | [#7](https://github.com/axv2655/hackmeta-26/issues/7) |
| C7 | Users, auth picker, settings, friends, blocks, auto-join | P0 | M1 | T0, C1 | [#8](https://github.com/axv2655/hackmeta-26/issues/8) |
| C8 | Moments: upload, tags, approval flow, media serving | P0 | M3 | T0, C4 | [#9](https://github.com/axv2655/hackmeta-26/issues/9) |
| C9 | WebSocket hub, ws route, EventPublisher implementation | P0 | M0 | T0, C1 | [#10](https://github.com/axv2655/hackmeta-26/issues/10) |
| C10 | Seed core: users, friends, circles, marks, live Moves, ghosts, Moments | P0 | M0 | T0, C1 | [#11](https://github.com/axv2655/hackmeta-26/issues/11) |
| C11 | Privacy and safety test suite (section 17.3 core cases) | P0 | M1 | T0, C5, C6 | [#12](https://github.com/axv2655/hackmeta-26/issues/12) |

## Lane 2: Muse (AI agents, notify pipeline, scheduler jobs)

| ID | Task | Pri | Milestone | Depends on | Issue |
| --- | --- | --- | --- | --- | --- |
| M1 | MuseClient, HttpMuseClient, FakeMuseClient, agent runner, muse_runs log | P0 | M0 | T0 | [#13](https://github.com/axv2655/hackmeta-26/issues/13) |
| M2 | Affinity math and compact Muse context builder | P0 | M1 | T0, M1 | [#14](https://github.com/axv2655/hackmeta-26/issues/14) |
| M3 | Notify picker agent with prompt and fallback | P0 | M2 | T0, M1, M2 | [#15](https://github.com/axv2655/hackmeta-26/issues/15) |
| M4 | Notify pipeline, Notifier implementation, notifications routes | P0 | M2 | T0, M3 | [#16](https://github.com/axv2655/hackmeta-26/issues/16) |
| M5 | Move writer, place resolver, compose-move | P0 | M2 | T0, M1 | [#17](https://github.com/axv2655/hackmeta-26/issues/17) |
| M6 | Move ranker agent and MuseGateway.rank_moves | P0 | M2 | T0, M2 | [#18](https://github.com/axv2655/hackmeta-26/issues/18) |
| M7 | Suggestions service, accept/dismiss routes, expiry job (flare agent removed) | P1 | M2 | T0, M2, M4 | [#19](https://github.com/axv2655/hackmeta-26/issues/19) |
| M8 | Taste agent, taste profiles, suggest-spots | P1 | M3 | T0, M1, M2 | [#20](https://github.com/axv2655/hackmeta-26/issues/20) |
| M9 | Pseudo-group detection and revive agent | P1 | M3 | T0, M2, M7 | [#21](https://github.com/axv2655/hackmeta-26/issues/21) |
| M10 | Nobody-bit agent and trigger job | P1 | M3 | T0, M2, M4, M7 | [#22](https://github.com/axv2655/hackmeta-26/issues/22) |
| M11 | Route and intent agents | P2 | M5 | T0, M1, M7 | [#23](https://github.com/axv2655/hackmeta-26/issues/23) |

## Lane 3: Surfaces (proximity, Reels, calendar, ratings, leaderboards, glasses, demo control)

| ID | Task | Pri | Milestone | Depends on | Issue |
| --- | --- | --- | --- | --- | --- |
| S1 | Proximity: tokens, sightings ingest, copresence, ProximityGateway | P1 | M4 | T0 | [#24](https://github.com/axv2655/hackmeta-26/issues/24) |
| S2 | Proximity sweep: join prompt, auto-join, exclusion | P1 | M4 | T0, S1 | [#25](https://github.com/axv2655/hackmeta-26/issues/25) |
| S3 | Open Moves discovery over BLE | P2 | M5 | T0, S1 | [#26](https://github.com/axv2655/hackmeta-26/issues/26) |
| S4 | Reels: list, place chip, save to Saved Mark | P1 | M4 | T0 | [#27](https://github.com/axv2655/hackmeta-26/issues/27) |
| S5 | Calendar: mock events and busy blocks (no consumer after the flare cut; deferred, see S5) | P2 | M5 | T0 | [#28](https://github.com/axv2655/hackmeta-26/issues/28) |
| S6 | Pairwise ranking domain and rating service | P1 | M3 | T0 | [#29](https://github.com/axv2655/hackmeta-26/issues/29) |
| S7 | Leaderboards: top spots and my list | P1 | M3 | T0, S6 | [#30](https://github.com/axv2655/hackmeta-26/issues/30) |
| S8 | Move-ended handler: hangouts and rating prompt | P1 | M3 | T0 | [#31](https://github.com/axv2655/hackmeta-26/issues/31) |
| S9 | Glasses: shared compose/confirm service, `/mcp` connector wiring, fallback `/glasses/*` routes | P2 | M5 | T0 | [#32](https://github.com/axv2655/hackmeta-26/issues/32) |
| S10 | Demo Control routes (/demo/*), DEMO_MODE only | P0 | M2 | T0 | [#33](https://github.com/axv2655/hackmeta-26/issues/33) |
| S11 | Seed surfaces: hangouts, ratings, rankings, reels, calendar, saved | P0 | M0 | T0 | [#34](https://github.com/axv2655/hackmeta-26/issues/34) |

---

# Task details

## T0: Contract freeze: tables, ports, hooks, lane scaffolding ([#1](https://github.com/axv2655/hackmeta-26/issues/1))

**Lane:** `shared`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** none
**Spec:** ARCHITECTURE.md sections 4, 5, 9.1, 14, 17

### You own
- `backend/app/tables/**`
- `backend/app/ports.py`
- `backend/app/ports_null.py`
- `backend/app/hooks.py`
- `backend/app/container.py`
- `backend/app/lanes/**` (scaffold only; after T0 merges each lane appends to its own `lanes/<lane>.py`)
- `backend/app/scheduler/loop.py`
- `backend/app/seed/ids.py`
- `backend/app/seed/seed.py`
- `backend/app/api/main.py`
- `backend/app/api/deps.py`
- `backend/app/models/__init__.py`
- `backend/app/models/shared.py`
- `backend/tests/conftest.py`
- `backend/tests/contract/**`

### Build
- Add deps: `sqlmodel`, `httpx` (runtime), `python-multipart`.
- `app/tables/{core,muse,surfaces}.py`: every table from section 5, columns only, no logic. Re-export from `app/tables/__init__.py`. Split by write-owner: core = users, friendships, circles, circle_members, blocks, user_settings, autojoin_prefs, marks, saved_marks, moves, move_audience, move_audience_circles, move_participants, moments, moment_tags; muse = muse_runs, taste_profiles, pseudo_groups, suggestions, notifications; surfaces = proximity_sightings, copresence, hangouts, ratings, mark_rankings, calendar_events, reels, saved_reels.
- Rule: a lane WRITES only its own tables. Reading any table is fine. Cross-lane behavior goes through ports only. Seed-only exception: `seed/history.py` (S11) inserts ended `moves` and `move_participants` rows for history.
- `app/models/shared.py`: the section 14.1 types (UserLite, Category, Mark, Participant, Move, AudienceSummary, NotifyPick, Suggestion, MoveDraft, Notification) as Pydantic models, frozen with the contract. Also create empty `app/models/{core,muse,surfaces}.py`; each lane puts its endpoint-specific request/response models in its own file. This replaces the template's `app/models.py`.
- `app/api/deps.py`: `get_session` passthrough and `current_user_id` (reads `X-User-Id`; 401 when missing, 404 for an unknown user). Every lane's routes import it; nobody defines another.
- `app/ports.py`: frozen dataclasses `MoveCreate` (the `POST /moves` fields plus `notify_user_ids: frozenset[str] | None`), `MoveSnapshot`, `ParticipantSnapshot`, `MarkSnapshot`, `NotifyPickOut`, `MoveDraftOut`, `RankedMove`, `PlaceResolution`, `Intent`, `SuggestionSnapshot`, plus Protocols `Clock`, `EventPublisher`, `Notifier`, `MoveGateway`, `MarkGateway`, `MuseGateway`, `ProximityGateway` (signatures in docs/BACKEND_TASKS.md section 3).
- `app/ports_null.py`: a safe no-op implementation of every port so the app boots and every lane runs with the other two lanes absent.
- `app/hooks.py`: registry with `on_move_created(move_id, notify_user_ids)`, `on_move_joined(move_id, user_id)`, `on_move_ended(move_id)`, `on_rating_submitted(move_id, user_id)`. Handlers run in registration order; an exception in one is logged and swallowed so one lane never breaks another.
- `app/container.py` (holds one slot per port, defaults from `ports_null`) and `app/lanes/{core,muse,surfaces}.py`, each exposing `register(container, hooks, scheduler)`. `main.py` lifespan calls all three. Each lane edits ONLY its own `lanes/<lane>.py` to wire itself in.
- `scheduler/loop.py`: generic asyncio loop with `scheduler.register(name, fn, interval_s)`. Lanes register their own jobs; nobody edits the loop.
- Empty stub routers for every route module in the module map (docs/BACKEND_TASKS.md section 2), which adds `audience`, `circles`, `suggestions`, `pseudo_groups`, `muse_compose`, `muse_spots` and `proximity_prompt` to the section 4 list. All are already included in `api/main.py`, so no lane ever edits `main.py` again. `api/main.py` also keeps `GET /health` and mounts `StaticFiles(directory=backend/data/uploads, check_dir=False)` at `/media`.
- `seed/ids.py`: stable string IDs for the demo cast (anish, tony, maya, priya, dev, dhivyesh, jordan, mom, hs_*), key Marks (kumo_matcha, climbing_gym, pickleball_court, ...) and the 4 Reels (kumo_reel, ...). `seed/seed.py` runner drops and recreates the DB, then calls `seed.core`, `seed.history`, `seed.surfaces`, `seed.muse` in that order (each owned by a lane; a missing module is skipped).
- `tests/conftest.py`: function-scoped in-memory SQLite engine + session fixture. Per-lane dirs `tests/{core,muse,surfaces}/` each with an empty `fakes.py` and `factories.py`; after T0 merges these belong to the lane and every task in it appends to them.
- `tests/contract/test_lane_isolation.py`: statically parses imports and FAILS if a lane's source imports another lane's modules (mapping in docs/BACKEND_TASKS.md section 2). Also a test that the app boots with all-null ports.

### Acceptance
- [ ] All three lane owners review and approve the PR (this is the only cross-lane coupling).
- [ ] `uv run pytest && uv run ruff check .` pass; `uvicorn app.main:app` boots with every route stub registered.
- [ ] After merge, any change to `ports.py`, `hooks.py` or `tables/` needs an issue that all three owners approve.

### Tests
- Lane isolation test passes on the scaffold and fails when a deliberate cross-lane import is added.
- App boots using only null ports.



## C1: DB engine, session, Clock with demo offset, config ([#2](https://github.com/axv2655/hackmeta-26/issues/2))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 3.1, 15.2

### You own
- `backend/app/core/{config,db,clock}.py`
- `backend/tests/core/test_db_clock.py`

### Build
- Settings: `DB_PATH`, `DEMO_MODE`, `MUSE_*` placeholders (muse lane reads its own).
- `db.py`: engine, `get_session` dep, `create_all`, drop/recreate helper for seed reset.
- `clock.py`: `SystemClock` plus `DemoClock` with `set_time(iso)` / `shift(minutes)`; this is the only place `datetime.now()` appears. `DemoClock` implements the whole `Clock` port (`now`, `set_time`, `shift`) and is registered as the `Clock` port in `lanes/core.py`, so Demo Control (S10) changes time through the port.

### Acceptance
- [ ] Clock offset persists across calls and resets on demand.
- [ ] Nothing else in `app/` calls `datetime.now()` (add a grep test).

### Tests
- Clock offset math with fixed times.
- DB reset recreates empty tables.



## C2: Privacy domain: can_see, audience resolution, audience preview ([#3](https://github.com/axv2655/hackmeta-26/issues/3))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1)
**Spec:** ARCHITECTURE.md 1.5, 7.2, 12.1

### You own
- `backend/app/domain/privacy.py`
- `backend/app/services/audience.py`
- `backend/app/repositories/audience.py`
- `backend/app/api/routes/audience.py`
- `backend/tests/core/test_privacy.py`

### Build
- Pure `can_see(viewer, move_ctx)`: true iff creator, participant, or in `move_audience`, and not blocked by creator.
- `resolve_audience(creator, circle_ids, user_ids, blocks)`: union of circle members and direct picks, minus blocks, minus self.
- `POST /audience/preview` (in `routes/audience.py`) returning `AudienceSummary` (blocked users never listed).

### Acceptance
- [ ] `can_see` is the only visibility check anywhere in core.
- [ ] Preview matches what `POST /moves` will store.

### Tests
- Blocked user, non-audience friend, participant, creator, circle-only member cases.
- Blocked users never appear in preview.



## C3: Move domain state machine and SQL repository ([#4](https://github.com/axv2655/hackmeta-26/issues/4))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1), #3 (C2)
**Spec:** ARCHITECTURE.md 5.3, 7.3

### You own
- `backend/app/domain/{moves,errors}.py`
- `backend/app/repositories/moves.py`
- `backend/tests/core/test_move_domain.py`

### Build
- Pure transitions: none->going->there->left, ble paths straight to there, double join is idempotent, illegal transitions raise domain errors.
- Move end rules: creator ends, everyone left, 3h stale. Pure function `is_stale(move, now)`.
- Repository with visibility-filtered queries only (no 'list all'). Visible = the viewer is the creator, OR in `move_participants`, OR in `move_audience`; AND the viewer is not in the creator's `blocks`. This is the same predicate as `can_see`; the creator is never in `move_audience`, so a plain join on it would hide people's own Moves. Methods: create, get_visible, list_live_visible, participants, add/update participant.

### Acceptance
- [ ] No repository method returns a Move without a viewer-visibility filter, except the internal by-id fetch used by services.

### Tests
- Every transition, including illegal ones.
- Stale detection at boundary times.
- A creator sees their own Move though they are not in `move_audience`.



## C4: MoveService: create/join/arrive/leave/end, MoveGateway, hooks ([#5](https://github.com/axv2655/hackmeta-26/issues/5))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1), #3 (C2), #4 (C3)
**Spec:** ARCHITECTURE.md 7.2, 7.3, 9.1

### You own
- `backend/app/services/moves.py`
- `backend/tests/core/test_move_service.py`

### Build
- `create(creator_id, MoveCreate)`: resolve audience, store Move, add creator participant (there/going), fire `on_move_created(move_id, notify_user_ids)` with the list from `MoveCreate`, publish `move.created` to audience via `EventPublisher`.
- `join`, `arrive`, `leave`, `end`: publish `participant.changed` / `move.updated` / `move.ended`; fire `on_move_joined`, `on_move_ended`.
- `join` also sends `joined_your_move` ("Priya is pulling up") through the `Notifier` port to the creator and the current participants, never to the joiner.
- `end_stale()` registered as a scheduler job in `lanes/core.py`.
- Implement and register the `MoveGateway` port. `create`, `add_participant` and `end` go through this service, so a gateway call publishes the same events and fires the same hooks as the HTTP route (Demo Control, proximity and Muse rely on this). `add_open_audience(move_id, user_id)` inserts `move_audience(via='open_ble')`; `set_autojoin(user_id, other_user_id)` upserts `autojoin_prefs`.

### Ports you consume (fake them in your tests)
- EventPublisher (fake)
- Notifier (fake)
- Clock

### Acceptance
- [ ] Hooks fire exactly once per event.
- [ ] Works with null Notifier, null EventPublisher and no hook handlers.

### Tests
- Service tests with fake clock and recording publisher/hook registry.
- Auto-end of stale Move; Move with all participants left ends.
- `MoveGateway.add_participant` fires `on_move_joined` and publishes `participant.changed`; a join notifies the creator and participants, not the joiner.



## C5: Moves routes: create, detail, join/arrive/leave/end, feed, nearby ([#6](https://github.com/axv2655/hackmeta-26/issues/6))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #5 (C4)
**Spec:** ARCHITECTURE.md 7.1, 14.2

### You own
- `backend/app/api/routes/moves.py`
- `backend/tests/core/test_moves_routes.py`

### Build
- `POST /moves` (body: `MoveDraft` fields + `open`, `origin`, `notify_user_ids`, and the client's inside-the-geofence flag that makes the creator `there` instead of `going`; all passed to the service in `MoveCreate`), `GET /moves/{id}`, `POST /moves/{id}/{join,arrive,leave,end}`, `GET /moves/feed`.
- `GET /moves/nearby?lat&lng&radius_km`: round coords to 3 decimals, never store them; call `MuseGateway.rank_moves` and fall back to start-time order if it errors or times out (2s).
- `MoveRead` has the Mark's coordinates only, `muse_reason` from ranking, `audience` only for the creator.

### Ports you consume (fake them in your tests)
- MuseGateway.rank_moves (fake)

### Acceptance
- [ ] Non-audience viewer gets 404 on detail.
- [ ] Nearby works with the null MuseGateway.

### Tests
- HTTP round trips with `X-User-Id`.
- Ranking failure falls back.
- `notify_user_ids` from the body reaches `on_move_created`.



## C6: Marks: nearby, search, create, detail, save, MarkGateway ([#7](https://github.com/axv2655/hackmeta-26/issues/7))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1), #4 (C3)
**Spec:** ARCHITECTURE.md 5.2, 7.4, 14.2

### You own
- `backend/app/services/marks.py`
- `backend/app/repositories/marks.py`
- `backend/app/api/routes/marks.py`
- `backend/tests/core/test_marks.py`

### Build
- `GET /marks/nearby` (Saved Marks + Marks with ghosts), `/marks/search`, `POST /marks`, `GET /marks/{id}`, save/unsave, `GET /me/saved`.
- Ghost computation on read: participants with status `left` or ended Moves within 24h, only where `ghost_visible` and viewer is in the original `move_audience`.
- Detail includes `score` / `friends_score` read from `mark_rankings` (null when absent).
- Detail also returns recent Moments at the Mark, only from Moves the viewer `can_see`: pending Moments for that Move's participants only, approved Moments for the rest of the audience.
- Implement the `MarkGateway` port (`get`, `nearest`, `save`) used by Reels and glasses.

### Acceptance
- [ ] Ghosts never show to non-audience viewers.
- [ ] Mark detail works with empty rankings.

### Tests
- Ghost window boundary (23h vs 25h).
- Save/unsave idempotent.
- Mark detail hides Moments from Moves the viewer cannot see.



## C7: Users, auth picker, settings, friends, blocks, auto-join ([#8](https://github.com/axv2655/hackmeta-26/issues/8))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1)
**Spec:** ARCHITECTURE.md 5.1, 12.2, 14.2

### You own
- `backend/app/services/users.py`
- `backend/app/services/circles.py`
- `backend/app/api/routes/{auth,users,circles}.py`
- `backend/tests/core/test_users.py`

### Build
- `GET /auth/users`, `GET /me`, `PATCH /me/settings`, `GET /friends`, `/me/blocks` (GET/POST/DELETE), `/me/autojoin` (GET/PUT).
- Resolve the current user with `app.api.deps.current_user_id` (T0 owns it); do not define another `X-User-Id` dependency.
- Circles CRUD in `routes/circles.py` + `services/circles.py`: `GET/POST /circles`, `PATCH/DELETE /circles/{id}`.

### Acceptance
- [ ] Settings default to location/ble/calendar opt-in false, muse_proactive true.
- [ ] Circle membership edits only by the owner.

### Tests
- Settings defaults.
- Block add/remove.
- Circle owner-only edits.



## C8: Moments: upload, tags, approval flow, media serving ([#9](https://github.com/axv2655/hackmeta-26/issues/9))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #5 (C4)
**Spec:** ARCHITECTURE.md 5.3, 7.4

### You own
- `backend/app/services/moments.py`
- `backend/app/api/routes/moments.py`
- `backend/tests/core/test_moments.py`

### Build
- `POST /moves/{id}/moments` (multipart: file, caption, tagged ids), `GET /moves/{id}/moments`, `POST /moments/{id}/approve`.
- Visible to Move participants immediately; to the rest of the audience only when every tag approved.
- Serve Moment media from `backend/data/uploads` through the authenticated `GET /media/{filename}` route (never a public `StaticFiles` mount: a pending Moment must not be reachable by URL). `/api/v1/media/{filename}` remains as an alias; seeded Mark photos are public at `/media/seed/marks/{asset_name}`.
- Publish `moment.added`, `moment.approval_needed`; send `moment_approval` via the `Notifier` port.

### Ports you consume (fake them in your tests)
- Notifier (fake)
- EventPublisher (fake)

### Acceptance
- [ ] Pending Moment invisible to non-participant audience.
- [ ] Only participants may upload.

### Tests
- Approval state machine with 0, 1, many tags.
- Upload stores a file and row.
- A blocked user and a non-audience friend cannot fetch a Move's Moments (the section 17.3 "via Moments" case lives here, not in C11).



## C9: WebSocket hub, ws route, EventPublisher implementation ([#10](https://github.com/axv2655/hackmeta-26/issues/10))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1)
**Spec:** ARCHITECTURE.md 9.1

### You own
- `backend/app/realtime/hub.py`
- `backend/app/api/routes/ws.py`
- `backend/tests/core/test_hub.py`

### Build
- `ConnectionHub`: user_id -> sockets, `publish(user_ids, type, data)` with `{type, data, ts}` envelope.
- `GET /api/v1/ws?user_id=` accepts, registers, cleans up on disconnect; a dead socket never breaks a publish to others.
- Register the hub as the `EventPublisher` port in `lanes/core.py`.

### Acceptance
- [ ] Multiple sockets per user all receive events.
- [ ] Publish to a user with no sockets is a no-op.

### Tests
- Hub tests with fake socket objects (no real server).
- Disconnect during publish.



## C10: Seed core: users, friends, circles, marks, live Moves, ghosts, Moments ([#11](https://github.com/axv2655/hackmeta-26/issues/11))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1)
**Spec:** ARCHITECTURE.md 15.1

### You own
- `backend/app/seed/core.py`
- `backend/app/seed/assets/**`
- `backend/tests/core/test_seed_core.py`

### Build
- Write rows directly to the core-owned tables (plain inserts; no repository or service needed) using IDs from `seed/ids.py`.
- 12 to 15 users with the demo cast, friendships, Anish's four Circles (Climbing tagged as a Facebook Group), 30 to 40 Marks around the demo center (constant at top of file), Mom blocked from Anish's Moves, settings.
- Live state: Tony's live Move at Kumo Matcha with 2 others; Jordan's open pickleball Move; ghosts and seeded Moments at another Mark from last night.
- Anish's `saved_marks` row for Kumo Matcha (`source=reel`, `source_ref` = the Kumo Reel id from `seed/ids.py`, saved 3 days ago). It is a plain Saved Mark; no agent acts on it (flares are removed).
- Does NOT write hangouts, ratings, rankings, reels, calendar (those belong to surfaces seed).

### Acceptance
- [ ] `uv run python -m app.seed.seed` leaves a valid core world when the other seed modules are empty.

### Tests
- Seed is idempotent after a reset; expected counts and cast present.



## C11: Privacy and safety test suite (section 17.3 core cases) ([#12](https://github.com/axv2655/hackmeta-26/issues/12))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #6 (C5), #7 (C6)
**Spec:** ARCHITECTURE.md 12.1, 17.3

### You own
- `backend/tests/core/test_privacy_suite.py`

### Build
- Blocked user and non-audience friend cannot fetch a Move by id, in nearby, in feed, or as a ghost. (The Moments case is tested in C8, which lands later.)
- Introspect every Pydantic model in `app/models/**` (shared plus all three lane files) and every `response_model` registered on the app's routes, and assert no field named lat/lng belongs to a user-typed model; Mark coordinates are allowed.

### Acceptance
- [ ] Suite is deterministic and uses only core fakes and factories.

### Tests
- As described; no dependence on other lanes' implementations.



## M1: MuseClient, HttpMuseClient, FakeMuseClient, agent runner, muse_runs log ([#13](https://github.com/axv2655/hackmeta-26/issues/13))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 3.2, 10.2, 10.12

### You own
- `backend/app/muse/{client,runner,gateway}.py`
- `backend/tests/muse/test_runner.py`

### Build
- FIRST: verify the real Muse API (base URL, auth, model id, JSON mode, vision) and record findings in docs/BACKEND_TASKS.md section 6. Only `HttpMuseClient.complete()` knows the wire format.
- `run_agent(agent, user_id, prompt, schema, fallback, images=None, max_tokens)`: JSON extract, Pydantic validate, 6s timeout, one retry, then `fallback()`; always write `muse_runs`; 60s cache by prompt hash.
- `FakeMuseClient` returning canned or programmable outputs, and `DEMO_MODE=offline` that forces it.
- `get_stats()` for calls, tokens, fallback rate, last outputs.
- `muse/gateway.py`: `MuseGatewayImpl`, the single implementation of the `MuseGateway` port, registered in `lanes/muse.py`. It exposes `bind(method_name, fn)`; a method nobody has bound yet returns the same result as `ports_null`. Later muse tasks bind their function in `lanes/muse.py` and never edit `gateway.py`. `muse_stats()` returns `get_stats()`.

### Acceptance
- [ ] Garbage output, timeout and transport error each return the fallback and log a run.

### Tests
- Valid, invalid, slow and erroring fake clients.
- Cache hit does not call the client.
- An unbound gateway method returns the null result; a bound one is called.



## M2: Affinity math and compact Muse context builder ([#14](https://github.com/axv2655/hackmeta-26/issues/14))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1)
**Spec:** ARCHITECTURE.md 10.1

### You own
- `backend/app/domain/affinity.py`
- `backend/app/muse/context.py`
- `backend/tests/muse/test_affinity_context.py`

### Build
- Pure affinity features and score from rows of hangouts, notifications, circles, mock calendar (read-only table access).
- Context renderer: at most 25 candidates, aliases `u1..`, names restored after parsing, no coordinates/addresses/calendar titles.

### Acceptance
- [ ] Same inputs always give the same score; alias round-trip is lossless.

### Tests
- Formula on hand-built hangouts.
- Truncation to 25.
- Alias restore.



## M3: Notify picker agent with prompt and fallback ([#15](https://github.com/axv2655/hackmeta-26/issues/15))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1), #14 (M2)
**Spec:** ARCHITECTURE.md 10.3

### You own
- `backend/app/muse/agents/notify_picker.py`
- `backend/app/muse/prompts/notify_picker.md`
- `backend/tests/muse/test_notify_picker.py`

### Build
- Output `{picks:[{user,copy,reason}], skipped_note}`; cap `min(8, ceil(audience/2))`; one stretch pick when signals allow; never busy people; unverified users never stretch picks. `max_tokens=500`.
- Fallback: top N by affinity with templated copy starting 'Hey {first_name}'.

### Acceptance
- [ ] Valid output parses; garbage output triggers the fallback.

### Tests
- Cap math, forced adds/removes, fallback copy.



## M4: Notify pipeline, Notifier implementation, notifications routes ([#16](https://github.com/axv2655/hackmeta-26/issues/16))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #15 (M3)
**Spec:** ARCHITECTURE.md 9.2, 9.3, 8.3 (exclusion)

### You own
- `backend/app/services/notify.py`
- `backend/app/api/routes/{notifications,muse}.py`
- `backend/tests/muse/test_notify_pipeline.py`

### Build
- Pipeline: candidates = audience minus participants minus `ProximityGateway.copresent_cluster` minus quiet hours/muted categories minus already notified; run picker; store notification; publish via `EventPublisher`.
- Register handlers on `on_move_created(move_id, notify_user_ids)` and `on_move_joined` (second-order nudge to the joiner's close friends in the audience; never widens audience). When `notify_user_ids` is not None it is the creator's confirmed list: those users are forced in and everyone else in the audience is forced out (Muse still writes each line of copy). None lets the picker choose. This handler is the only place the pipeline runs on create.
- Implement and register the `Notifier` port (store + publish `notification`).
- `GET /notifications`, `POST /notifications/read`, `POST /muse/notify-preview` (the only route in `routes/muse.py`). Bind `MuseGateway.notify_move` and `MuseGateway.notify_preview` (picks for a draft that is not posted yet; Reels and glasses call it too).

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- ProximityGateway (fake)
- EventPublisher (fake)

### Acceptance
- [ ] Participants and the co-present cluster are never notified.
- [ ] Works with null proximity and fake Muse.

### Tests
- Pipeline with fake MoveGateway, ProximityGateway, EventPublisher.
- Quiet hours, duplicates, a confirmed `notify_user_ids` list (those forced in, the rest forced out).



## M5: Move writer, place resolver, compose-move ([#17](https://github.com/axv2655/hackmeta-26/issues/17))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1)
**Spec:** ARCHITECTURE.md 10.4, 7.2

### You own
- `backend/app/muse/agents/{move_writer,place_resolver}.py`
- `backend/app/muse/prompts/{move_writer,place_resolver}.md`
- `backend/app/api/routes/muse_compose.py`
- `backend/tests/muse/test_writer_resolver.py`

### Build
- Writer: lowercase casual text under 60 chars, category, 3 alternates; fallback template per category; `max_tokens=150`.
- Resolver: geotag/caption/frame + 10 nearest Marks -> `{mark_id|new_mark, confidence}`; text-only fallback when no vision; `confidence < 0.6` flagged for 'Is this X?'.
- `POST /muse/compose-move` (in `routes/muse_compose.py`) -> `MoveDraft` (uses `MarkGateway.nearest`); bind `MuseGateway.compose_move` and `resolve_place` in `lanes/muse.py`.

### Ports you consume (fake them in your tests)
- MarkGateway (fake)

### Acceptance
- [ ] Heuristic draft returns instantly; Muse result replaces it when it lands.

### Tests
- Length/format validation, low-confidence flag, fallback.
- Both agents: valid canned output parses; garbage output from `FakeMuseClient` returns the fallback.



## M6: Move ranker agent and MuseGateway.rank_moves ([#18](https://github.com/axv2655/hackmeta-26/issues/18))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2)
**Spec:** ARCHITECTURE.md 10.5

### You own
- `backend/app/muse/agents/move_ranker.py`
- `backend/app/muse/prompts/move_ranker.md`
- `backend/tests/muse/test_ranker.py`

### Build
- Rank up to 15 Moves with one-line reason; 45s per-user cache; fallback sorts by max participant affinity; `max_tokens=400`. Bind `MuseGateway.rank_moves` in `lanes/muse.py`.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)

### Acceptance
- [ ] Every input Move appears exactly once in the output.

### Tests
- Missing/duplicate IDs from Muse are repaired; fallback order.
- Valid canned output parses; garbage output returns the fallback.



## M7: Suggestions service, accept/dismiss routes, expiry job ([#19](https://github.com/axv2655/hackmeta-26/issues/19))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2), #16 (M4)
**Spec:** ARCHITECTURE.md 9.3, 10.6 (removal note)

The flare agent, its prompt, the 60 s scan and `free_time` are **removed**. M7 is now only the shared suggestions plumbing that M9, M10 and M11 use.

### You own
- `backend/app/services/suggestions.py`
- `backend/app/api/routes/suggestions.py`
- `backend/tests/muse/test_suggestions.py`

### Build
- `services/suggestions.py` exposes `create_suggestion(user_id, type, payload, expires_at)`: it stores the row, sends the matching `muse_<type>` notification through the muse `Notifier` (`data.route=/suggestion/{id}`) and publishes `suggestion.created` via `EventPublisher`. Every muse agent that proposes something (M9, M10, M11) uses it. A scheduler job marks `pending` rows past `expires_at` as `expired`.
- Rules: max 2 proactive suggestions per user per day; no quiet hours; a dismissed suggestion suppresses the same target for a week.
- `GET /suggestions` (pending and unexpired only), `POST /suggestions/{id}/accept`, `/dismiss`. Accept dispatches on type: `nobody_bit` calls `MoveGateway.add_participant(target, user, 'going', 'tap')` then `MoveGateway.end(own_move, 'nobody_bit')`; `revive` / `route` return the stored draft and mark it accepted.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- EventPublisher (fake)
- Clock

### Acceptance
- [ ] Accepting `nobody_bit` joins the other Move and ends the empty one; `revive` / `route` return the stored draft. Muse never posts a Move without the tap.

### Tests
- Daily cap and suppression with a fake clock.
- A stored suggestion sends its notification and `suggestion.created`; expiry job.
- Accept dispatch per remaining type (`nobody_bit`, `revive`, `route`, `reel_move`).



## M8: Taste agent, taste profiles, suggest-spots ([#20](https://github.com/axv2655/hackmeta-26/issues/20))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1), #14 (M2)
**Spec:** ARCHITECTURE.md 10.7

### You own
- `backend/app/muse/agents/taste.py`
- `backend/app/services/taste.py`
- `backend/app/muse/prompts/{taste,suggest_spots}.md`
- `backend/app/api/routes/muse_spots.py`
- `backend/tests/muse/test_taste.py`

### Build
- Register a handler on `on_rating_submitted`; update `taste_profiles` for the rater and the attending pseudo-group; `max_tokens=300`.
- `POST /muse/suggest-spots` (in `routes/muse_spots.py`) returns 3 Marks with reasons; fallback by shared vibe tags and rankings.

### Ports you consume (fake them in your tests)
- MarkGateway (fake)

### Acceptance
- [ ] Profile summary/likes/dislikes always valid, even on fallback.

### Tests
- Update from fixture ratings; fallback spots.
- Taste agent: valid canned output parses; garbage output returns the fallback profile.



## M9: Pseudo-group detection and revive agent ([#21](https://github.com/axv2655/hackmeta-26/issues/21))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2), #19 (M7)
**Spec:** ARCHITECTURE.md 10.8

### You own
- `backend/app/domain/pseudo_groups.py`
- `backend/app/muse/agents/revive.py`
- `backend/app/muse/prompts/{revive,pseudo_group_label}.md`
- `backend/app/api/routes/pseudo_groups.py`
- `backend/app/seed/muse.py`
- `backend/tests/muse/test_revive.py`

### Build
- Pure clustering of `hangouts` into recurring sets of 2 to 6 with a pattern; `fading` when last hangout older than 2.5x usual gap (min 14 days).
- `refresh_pseudo_groups(owner_id)` upserts `pseudo_groups` rows (`member_ids`, `pattern`, `strength`, `last_hangout_at`, `fading`) with a Muse-written label (fallback `"<category> crew"`). Register a daily job in `lanes/muse.py`; `run_revive_scan` refreshes first, so `/demo/revive-scan` works without the nightly job.
- Store each revive proposal with `services.suggestions.create_suggestion` (type `revive`), which sends `muse_revive`. Bind `MuseGateway.run_revive_scan` in `lanes/muse.py`.
- `seed/muse.py` (the seed runner calls it last): run `refresh_pseudo_groups` over the seeded hangouts with fallback labels, and write Anish's `taste_profiles` row ("likes quiet aesthetic coffee shops, not chains"), so the revive card and the taste line exist on first load.
- Revive agent at most once a week per user; `GET /pseudo-groups` with history sparkline data; `POST /pseudo-groups/{id}/revive` -> `MoveDraft`; `MuseGateway.run_revive_scan`.

### Acceptance
- [ ] The climbing crew from seed-shaped fixtures is detected as fading.

### Tests
- Clustering on hand-built hangouts, fading threshold, weekly cap.
- Detection results are persisted to `pseudo_groups`; revive agent: valid canned output parses, garbage output returns the fallback.



## M10: Nobody-bit agent and trigger job ([#22](https://github.com/axv2655/hackmeta-26/issues/22))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2), #16 (M4), #19 (M7)
**Spec:** ARCHITECTURE.md 10.9

### You own
- `backend/app/muse/agents/nobody_bit.py`
- `backend/app/muse/prompts/nobody_bit.md`
- `backend/tests/muse/test_nobody_bit.py`

### Build
- Job: a Move with no joiners 15 min after posting. This is the only trigger (flares and `fill_deadline` are removed).
- Candidates: `MoveGateway.list_live_visible` plus `ProximityGateway.open_moves_near`; nothing else is ever suggested. No candidates means send nothing.
- Store the proposal with `services.suggestions.create_suggestion` (type `nobody_bit`), which sends `muse_nobody_bit`. Accepting it is handled by M7's accept route (joins the other Move and ends the empty one). Bind `MuseGateway.run_nobody_bit` in `lanes/muse.py`.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- ProximityGateway (fake)

### Acceptance
- [ ] Never produces a 'nobody came' message.

### Tests
- No candidates, one candidate, open Move candidate, fallback.
- Valid canned output parses; garbage output returns the fallback.



## M11: Route and intent agents ([#23](https://github.com/axv2655/hackmeta-26/issues/23))

**Lane:** `muse`  |  **Priority:** P2  |  **Milestone:** M5  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1), #19 (M7)
**Spec:** ARCHITECTURE.md 10.10, 10.11

### You own
- `backend/app/muse/agents/{route,intent}.py`
- `backend/app/muse/prompts/{route,intent}.md`
- `backend/tests/muse/test_route_intent.py`

### Build
- Intent: utterance -> `{intent, text, audience_hint}`; heuristic keyword fallback. Bind `MuseGateway.parse_intent` in `lanes/muse.py`.
- Route: two `going` audience members from the same coarse area, not walkable -> one suggestion stored with `services.suggestions.create_suggestion` (type `route`), which sends `muse_route`. Bind `MuseGateway.run_route` in `lanes/muse.py`.

### Acceptance
- [ ] Both agents work with FakeMuseClient and fall back cleanly.

### Tests
- Intent phrases; route eligibility rules.
- Both agents: valid canned output parses; garbage output returns the fallback.



## S1: Proximity: tokens, sightings ingest, copresence, ProximityGateway ([#24](https://github.com/axv2655/hackmeta-26/issues/24))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M4  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 8.2, 8.3, 8.4

### You own
- `backend/app/services/proximity.py`
- `backend/app/api/routes/proximity.py`
- `backend/tests/surfaces/test_proximity_ingest.py`

### Build
- `POST /proximity/token` (random, 15 min), `POST /proximity/sightings` (batch).
- Ingest: resolve tokens, RSSI >= -75, upsert `copresence` only for friends (strangers only for open Moves); co-present = seen within 60s.
- Purge sightings older than 2h via scheduler job in `lanes/surfaces.py`.
- `services/proximity.py` exposes `add_copresence_listener(fn)` and calls each listener with the changed pairs after any ingest that changes `copresence` (S2's sweep subscribes).
- `inject_sim(user_ids, on)` writes (or clears) `source: sim` sightings for every pair and runs the same ingest path. `POST /demo/copresence {user_ids, on}` lives here in `routes/proximity.py` (404 unless `DEMO_MODE`) and calls it.
- Implement `ProximityGateway.copresent_cluster` (connected component) and `open_moves_near`.

### Ports you consume (fake them in your tests)
- Clock

### Acceptance
- [ ] Never exposes a 'who is near me' list; raw sightings purged.

### Tests
- Token expiry, RSSI filter, friends-only, cluster math, purge with fake clock.
- `inject_sim` produces co-presence and calls listeners; `/demo/copresence` is 404 without `DEMO_MODE`.



## S2: Proximity sweep: join prompt, auto-join, exclusion ([#25](https://github.com/axv2655/hackmeta-26/issues/25))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M4  |  **Depends on (same lane or T0 only):** #1 (T0), #24 (S1)
**Spec:** ARCHITECTURE.md 8.3, 8.4

### You own
- `backend/app/services/proximity_sweep.py`
- `backend/app/api/routes/proximity_prompt.py`
- `backend/tests/surfaces/test_sweep.py`

### Build
- Handler on `on_move_created`, plus a listener registered with `proximity.add_copresence_listener` (S1) for co-presence changes, both wired in `lanes/surfaces.py`: cluster members in the audience but not participants get a `proximity.prompt` event, or are added `there` (`ble_auto`) if on the auto-join list, with a quiet `proximity_added` notification.
- `POST /proximity/prompt/{move_id}/accept` (in `routes/proximity_prompt.py`) body `{always}`; joins via `MoveGateway.add_participant(joined_via=ble_prompt)`. If `always`, it calls `MoveGateway.set_autojoin(user_id, <the participant they are co-present with>)`; surfaces never writes `autojoin_prefs` itself.
- A prompt only names people who are already participants.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- Notifier (fake)
- EventPublisher (fake)

### Acceptance
- [ ] Co-present people are added to `there` or prompted, never notified as FOMO (the notify pipeline excludes them through the cluster).

### Tests
- Auto-join vs prompt vs not-in-audience; prompt names only participants.



## S3: Open Moves discovery over BLE ([#26](https://github.com/axv2655/hackmeta-26/issues/26))

**Lane:** `surfaces`  |  **Priority:** P2  |  **Milestone:** M5  |  **Depends on (same lane or T0 only):** #1 (T0), #24 (S1)
**Spec:** ARCHITECTURE.md 8.5, 12.3

### You own
- `backend/app/services/open_moves.py`
- `backend/tests/surfaces/test_open_moves.py`

### Build
- Move beacon token ingest; a nearby opted-in, verified user whose categories match gets an open-Move card with first names and verified badges only.
- Joining calls `MoveGateway.add_open_audience(move_id, user_id)` and then `MoveGateway.add_participant(move_id, user_id, 'going', 'open_ble')`, and only when `open_moves_near(user_id)` contains the Move. Without the audience row `can_see` would hide the Move from the person who just joined. Unverified users cannot discover or join.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)

### Acceptance
- [ ] Strangers see no more than first names and badges.

### Tests
- Verified vs unverified; category match; opt-in required.



## S4: Reels: list, place chip, save to Saved Mark ([#27](https://github.com/axv2655/hackmeta-26/issues/27))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M4  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 11.1

### You own
- `backend/app/services/reels.py`
- `backend/app/api/routes/reels.py`
- `backend/tests/surfaces/test_reels.py`

### Build
- `GET /reels`, `GET /reels/{id}/place` (mark, distance, active friend Move summary, draft with Muse's notify list from `MuseGateway.notify_preview`) using `MuseGateway.resolve_place` once per Reel and caching `resolved_mark_id`.
- `POST /reels/{id}/save` inserts a `saved_reels` row and calls `MarkGateway.save(user_id, resolved_mark_id, 'reel', reel_id)`. `DELETE /reels/{id}/save` removes the `saved_reels` row only; the Saved Mark stays and is unsaved from the Mark.
- Works when Muse is unavailable: geotag, then nearest Mark by caption text.

### Ports you consume (fake them in your tests)
- MuseGateway (fake)
- MarkGateway (fake)
- MoveGateway (fake)

### Acceptance
- [ ] Active-Move summary only reflects Moves the viewer can see (through `MoveGateway.list_live_visible`).

### Tests
- Friends-there path, nobody-there path, resolver fallback.
- Save writes `saved_reels` and calls `MarkGateway.save`; unsave removes only the `saved_reels` row.



## S5: Calendar: mock events and busy blocks, no free-window consumer ([#28](https://github.com/axv2655/hackmeta-26/issues/28))

**Lane:** `surfaces`  |  **Priority:** P2 (was P1)  |  **Milestone:** M5 (was M4)  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 10.6 (removal note), 12.1

**Does S5 still have a consumer? No.** Its only consumer was M7's flare agent through `CalendarGateway.free_window`. With flares and `free_time` removed, nothing calls the gateway, so `CalendarGateway`, `FreeWindow` and the pure `free_window` function are dropped. The one remaining reader of calendar data is the notify picker's busy/free signal (10.1 `currently`, M2), which reads the surfaces-owned `calendar_events` table directly (read-only table access is allowed), not S5's routes. The `calendar_events` rows come from S11's seed, not from S5.

Recommendation: **defer S5** and build it only if time is left after M4. If built, it is just the two routes below. If cut, also drop `GET /calendar` and `PUT /calendar/busy` from ARCHITECTURE.md 14.2, `lib/calendar.ts` and the Calendar onboarding opt-in. `user_settings.calendar_opt_in` still gates whether the notify picker sees busy/free.

### You own
- `backend/app/services/calendar.py`
- `backend/app/api/routes/calendar.py`
- `backend/tests/surfaces/test_calendar.py`

### Build (only if built)
- `GET /calendar`, `PUT /calendar/busy` (start/end only, never titles; replaces the user's previous device blocks; `end <= start` is 422; `GET` reports `source: device|mock`).
- No `free_window`, no port.

### Ports you consume (fake them in your tests)
- Clock

### Acceptance
- [ ] The server never stores titles from a device calendar.

### Tests
- Busy blocks replace rather than append; titles never persisted; invalid range rejected.



## S6: Pairwise ranking domain and rating service ([#29](https://github.com/axv2655/hackmeta-26/issues/29))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 13.1

### You own
- `backend/app/domain/ranking.py`
- `backend/app/services/ratings.py`
- `backend/app/api/routes/ratings.py`
- `backend/tests/surfaces/test_ranking_ratings.py`

### Build
- `next_comparison` and `apply` per the interface in section 13.1; placeholder binary insertion with score bands by face (Loved 7 to 10). The team's own algorithm drops in behind this interface later.
- `GET /moves/{id}/rating/questions`, `POST /moves/{id}/rating`: update `ratings`, `mark_rankings`; fire `on_rating_submitted`.

### Acceptance
- [ ] Ordering is stable and scores strictly decrease down the list.

### Tests
- Insertion at top/middle/bottom, ties, empty list.



## S7: Leaderboards: top spots and my list ([#30](https://github.com/axv2655/hackmeta-26/issues/30))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #29 (S6)
**Spec:** ARCHITECTURE.md 13.2

### You own
- `backend/app/services/leaderboards.py`
- `backend/app/api/routes/leaderboards.py`
- `backend/tests/surfaces/test_leaderboards.py`

### Build
- Computed on read from `mark_rankings`; friends only; category filter; 'your score / friends' score'.

### Acceptance
- [ ] Non-friends never influence a score.

### Tests
- Friends vs non-friends, category filter.



## S8: Move-ended handler: hangouts and rating prompt ([#31](https://github.com/axv2655/hackmeta-26/issues/31))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 7.3, 13.1

### You own
- `backend/app/services/hangouts.py`
- `backend/tests/surfaces/test_hangouts.py`

### Build
- Handler on `on_move_ended`: write one `hangouts` row per pair that was `there` (weekday, hour bucket, category), send `rate_move` via `Notifier` and `rating.prompt` via `EventPublisher`.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- Notifier (fake)
- EventPublisher (fake)

### Acceptance
- [ ] Pairs that never overlapped as `there` produce no hangout.

### Tests
- Pair generation for 2, 3, 4 attendees; hour buckets.



## S9: Glasses: shared compose/confirm service, `/mcp` connector, fallback routes ([#32](https://github.com/axv2655/hackmeta-26/issues/32))

**Lane:** `surfaces`  |  **Priority:** P2  |  **Milestone:** M5  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 11.4, 14.2

Scope change: the primary glasses path is now a **Meta AI connector**, a remote MCP server at `/mcp`. The `/glasses/*` routes shrink to the fallback for the in-app voice screen. A parallel agent builds the MCP server itself; this task is the shared service underneath both entry points and the contract the MCP build must meet.

### You own
- `backend/app/services/glasses.py` (shared compose and confirm logic, draft store)
- `backend/app/api/routes/glasses.py` (fallback routes)
- `backend/app/mcp/**` (the `/mcp` server: transport, bearer auth, tool handlers)
- `backend/tests/surfaces/test_glasses.py`, `backend/tests/surfaces/test_mcp.py`

### Build
- **Shared service** `services/glasses.py`: `draft(user_id, text, to, place, lat, lng)` -> `MuseGateway.parse_intent` -> place from `place` or `MarkGateway.nearest` (coarse coordinates, never stored) -> `compose_move` + `MuseGateway.notify_preview` -> draft plus a spoken confirmation line. `confirm(user_id, draft_id, request_id)` posts via `MoveGateway.create(origin=glasses)`. Drafts sit in an in-memory 5-minute TTL store shared by every entry point (a restart drops them; the user asks again). **Idempotent**: the same `request_id`, or an already-confirmed `draft_id`, returns the same Move and creates no second one. Unknown or expired `draft_id` is a domain error, never a silent new Move. Non-start intents are a friendly no-op.
- **Fallback routes**: `POST /glasses/command` (-> `draft`) and `POST /glasses/confirm` (-> `confirm`), `X-User-Id` auth as everywhere else. Used by `glasses.tsx`.
- **`/mcp`**: MCP Streamable HTTP, **stateless**, mounted in FastAPI at `/mcp` (not under `/api/v1`). Bearer auth: `Authorization: Bearer <MCP_TOKEN>`, 401 if missing or wrong, compare in constant time. Every authorized call acts as the user `MCP_USER_ID`; `X-User-Id` is ignored. Both are env vars (add to `.env.example`), startup fails fast with `/mcp` disabled and a clear log if `MCP_TOKEN` is unset, never an open endpoint.
- **Tools**, each a thin call into existing services through ports:
  - `draft_move(text, to?, place?, lat?, lng?)`: **no write**, no notification. Returns `{draft_id, spoken}`.
  - `confirm_move(draft_id, request_id)`: idempotent; the tool description tells the caller to invoke it only after explicit user confirmation.
  - `share_move`: share link and line for a live Move (ARCHITECTURE.md 9.4).
  - `pull_up`: `MoveGateway.add_participant(move_id, user, 'going', 'tap')`, only for a Move the caller can see.
  - `friends_nearby`: live Moves from friends near here, opted-in users only, **places and activities, not people**; no coordinates in the result.
  - `get_my_active_move`: the caller's live Move or none, so a retry after a timeout can check before drafting again.
- Argument shapes beyond the ones above (for `share_move`, `pull_up`, `friends_nearby`) are fixed by the MCP build; update ARCHITECTURE.md 11.4 in the same change if they differ.

### Open wiring (T0 or core owners, raise before M5)
- Mounting `/mcp` needs access to the FastAPI app, which lives in T0's `api/main.py`; a lane may only wire itself in `lanes/surfaces.py`. Either the lane hook can return an ASGI mount, or T0 adds a one-line mount (contract change, rule 8).
- `MCP_TOKEN` / `MCP_USER_ID` belong in `core/config.py` (core-owned) and the `mcp` package is a new dependency in `pyproject.toml` (T0). Both need a small cross-lane change.
- `share_move` uses the invite service from ARCHITECTURE.md 9.4 (core), and `friends_nearby` needs the opt-in flags from `user_settings` (core). Neither is a port today; add one, or have the MCP build read the tables read-only and call the invite service through a port.

### Ports you consume (fake them in your tests)
- MuseGateway (fake)
- MarkGateway (fake)
- MoveGateway (fake)

### Acceptance
- [ ] Nothing posts before confirm, through `/mcp` or `/glasses/*`.
- [ ] `confirm_move` twice with the same `request_id` returns one Move.
- [ ] `/mcp` without or with a wrong bearer token is 401; with `MCP_TOKEN` unset it is disabled, not open.
- [ ] `friends_nearby` returns no coordinates and nobody who has not opted in.
- [ ] Works with Muse down (heuristic parser and writer).

### Tests
- Start-a-Move utterance, unrelated utterance, confirm, double confirm, expired draft.
- Bearer auth: missing, wrong, right. Stateless: two calls with no shared session both work.
- `pull_up` on a Move the caller cannot see is refused.
- No user coordinates in any tool result.



## S10: Demo Control routes (/demo/*), DEMO_MODE only ([#33](https://github.com/axv2655/hackmeta-26/issues/33))

**Lane:** `surfaces`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 15.2

### You own
- `backend/app/api/routes/demo.py`
- `backend/app/services/demo.py`
- `backend/tests/surfaces/test_demo.py`

### Build
- Routes: reset, time, revive-scan, friend-move, friend-join, end-move, nobody-bit, route, muse-stats. (`/demo/copresence` is built by S1, next to the ingest code it drives.)
- Every trigger calls the same gateway code path as production, through ports only. No duplicate logic. Mapping: `time` -> `Clock.set_time` / `Clock.shift`; `reset` -> seed runner, then `Clock.set_time(None)`; `revive-scan` / `nobody-bit` / `route` -> `MuseGateway.run_revive_scan` / `run_nobody_bit` / `run_route`; `friend-move` -> `MoveGateway.create`; `friend-join` -> `MoveGateway.add_participant(move_id, user_id, 'going', 'tap')` (same path as `POST /moves/{id}/join`, so the second-order nudge fires); `end-move` -> `MoveGateway.end`; `muse-stats` -> `MuseGateway.muse_stats`.
- All routes return 404 unless `DEMO_MODE` is set.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- MuseGateway (fake)
- Clock (fake; uses `set_time` / `shift`)

### Acceptance
- [ ] With null gateways every route returns a clean result, not a 500.

### Tests
- DEMO_MODE gating; each route dispatches to the right fake.



## S11: Seed surfaces: hangouts, ratings, rankings, reels, calendar, saved ([#34](https://github.com/axv2655/hackmeta-26/issues/34))

**Lane:** `surfaces`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 15.1

### You own
- `backend/app/seed/{surfaces,history}.py`
- `backend/tests/surfaces/test_seed_surfaces.py`

### Build
- Write directly to surfaces-owned tables using IDs from `seed/ids.py`. Seed-only exception to table ownership: `seed/history.py` may INSERT ended `moves` (past `starts_at` / `ends_at`, relative to the Clock) and their `move_participants` rows directly, without firing hooks, as the history behind `hangouts`. No other surfaces code writes core tables.
- 8 weeks of history with the deliberate patterns: Anish+Priya(+Tony) matcha weekday afternoons; Anish+Tony+Maya lunch; Anish+Maya+Dev climbing Thursdays that stopped 4 weeks ago; HS friends one hangout 6 weeks ago.
- Ratings and rankings so boards and taste have signal; 4 Reels (Kumo geotag, nobody-there Mark, caption-only); Anish's mock calendar (a few classes, only the notify picker's busy/free signal reads it); his saved Kumo Reel from 3 days ago (the `saved_reels` row; C10 seeds the matching `saved_marks` row).

### Acceptance
- [ ] Seed history is generated relative to the Clock so patterns stay 'recent' on demo day.

### Tests
- Pattern assertions on the generated rows (counts, weekdays, fading group gap).



## Z1: Cross-lane integration smoke tests (run only after lanes merge) ([#35](https://github.com/axv2655/hackmeta-26/issues/35))

**Lane:** `shared`  |  **Priority:** P0  |  **Milestone:** M6  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 15.3, 17.3

### You own
- `backend/tests/integration/**`

### Build
- Wire the real implementations and run the demo script end to end through HTTP and WebSocket: post Move -> audience/notify -> join -> second-order nudge -> end -> rating -> leaderboard; revive scan -> accept; nobody-bit; and (new) `/mcp`: `draft_move` -> `confirm_move` twice with one `request_id` -> one Move, then the other tools.
- Drive the script through `/demo/*`, as section 15.2 does, and also cover: (a) Reel path: `GET /reels/{kumo}/place` returns the "Tony + 2 friends are here rn" summary, Anish joins, Priya gets the second-order nudge; (b) `/demo/copresence` puts Anish and Maya together, Anish posts, Maya gets `proximity.prompt` (or is auto-added) and no FOMO notification while a far friend gets one; (c) `/demo/revive-scan` produces the climbing-crew suggestion; (d) nobody-bit on a Move with no joiners after 15 minutes (or `/demo/nobody-bit`) offers Jordan's open pickleball Move and accepting joins it; (e) privacy across lanes: Mom (on Anish's hidden-from list) gets no notification and no proximity prompt for Anish's Move, never sees it in a Reel's active-Move summary, and is never offered it by nobody-bit.
- Also: notify pipeline excludes the co-present cluster with real S1/S2; ranking fallback with real C5 and M6; the Muse-offline mode (`DEMO_MODE=offline`) completes the same script.

### Acceptance
- [ ] Lives only in `tests/integration/`, is not part of any lane's CI gate, and is run by all three people together.

### Tests
- N/A (this is the test task).


