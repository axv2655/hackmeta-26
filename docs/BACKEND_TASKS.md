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
2. **Write ownership per table.** A lane writes only its own tables. Reading any table is fine. Table split is in T0.
3. **Behavior crosses lanes only through ports** (section 3). Every port has a safe null implementation, so any lane runs alone.
4. **Each lane wires itself in one file:** `app/lanes/<lane>.py`. No shared registration list.
5. **Lifecycle hooks instead of calls.** Core fires `on_move_created/joined/ended`; Muse and Surfaces subscribe. Core never imports them.

### Module map (used by the lane-isolation test)

| Lane | Source files |
| --- | --- |
| core | `core/*`, `domain/{moves,privacy,errors}.py`, `repositories/{moves,marks,audience}.py`, `services/{moves,marks,audience,users,moments}.py`, `realtime/*`, `seed/core.py`, routes `{auth,users,marks,moves,moments,ws}.py`, `lanes/core.py` |
| muse | `muse/*`, `domain/{affinity,pseudo_groups}.py`, `services/{notify,suggestions,taste}.py`, routes `{muse,notifications,suggestions,pseudo_groups}.py`, `lanes/muse.py` |
| surfaces | `domain/ranking.py`, `services/{proximity,proximity_sweep,open_moves,reels,calendar,ratings,leaderboards,hangouts,glasses,demo}.py`, `seed/{surfaces,history}.py`, routes `{proximity,reels,calendar,ratings,leaderboards,glasses,demo}.py`, `lanes/surfaces.py` |

`tests/contract/test_lane_isolation.py` fails if one lane imports another's files. Importing `app.ports`, `app.tables`, `app.hooks`, `app.core`, `app.seed.ids` is always allowed.

## 3. The contract (created by T0)

Signatures are the proposal. T0 may adjust details, then freezes them.

```python
# app/ports.py
class Clock(Protocol):            def now(self) -> datetime: ...
class EventPublisher(Protocol):   async def publish(self, user_ids: Iterable[str], type: str, data: dict) -> None: ...   # impl: core C9
class Notifier(Protocol):         async def send(self, user_id: str, type: str, title: str, body: str, data: dict) -> str: ...  # impl: muse M4

class MoveGateway(Protocol):      # impl: core C4
    def get(self, move_id: str) -> MoveSnapshot | None: ...
    def audience_ids(self, move_id: str) -> frozenset[str]: ...
    def list_live_visible(self, viewer_id: str) -> list[MoveSnapshot]: ...
    def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot: ...
    def add_participant(self, move_id: str, user_id: str, status: str, joined_via: str) -> None: ...
    def end(self, move_id: str, reason: str) -> None: ...
    def end_stale(self) -> list[str]: ...

class MarkGateway(Protocol):      # impl: core C6
    def get(self, mark_id: str) -> MarkSnapshot | None: ...
    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]: ...
    def save(self, user_id: str, mark_id: str, source: str, source_ref: str | None) -> None: ...

class MuseGateway(Protocol):      # impl: muse (M1, M4 to M11)
    async def compose_move(self, user_id: str, mark_id: str | None, seed_text: str | None) -> MoveDraftOut: ...
    async def notify_move(self, move_id: str, force_ids: set[str], drop_ids: set[str]) -> list[NotifyPickOut]: ...
    async def rank_moves(self, viewer_id: str, moves: list[MoveSnapshot]) -> list[RankedMove]: ...
    async def resolve_place(self, user_id: str, geotag_mark_id: str | None, caption: str | None, coarse: tuple[float, float] | None) -> PlaceResolution: ...
    async def parse_intent(self, utterance: str) -> Intent: ...
    async def run_flare_scan(self, user_id: str) -> SuggestionSnapshot | None: ...
    async def run_revive_scan(self, user_id: str) -> SuggestionSnapshot | None: ...
    async def run_nobody_bit(self, move_id: str) -> SuggestionSnapshot | None: ...
    async def run_route(self, move_id: str, user_ids: list[str]) -> SuggestionSnapshot | None: ...
    def muse_stats(self) -> dict: ...

class ProximityGateway(Protocol): # impl: surfaces S1
    def copresent_cluster(self, user_id: str) -> frozenset[str]: ...
    def open_moves_near(self, user_id: str) -> list[str]: ...

class CalendarGateway(Protocol):  # impl: surfaces S5
    def free_window(self, user_id: str, now: datetime) -> FreeWindow | None: ...
```

```python
# app/hooks.py  (handlers run in registration order; one handler failing never breaks another)
on_move_created(move_id)      # core fires; surfaces: proximity sweep (S2); muse: notify pipeline (M4)
on_move_joined(move_id, uid)  # core fires; muse: second-order nudge (M4)
on_move_ended(move_id)        # core fires; surfaces: hangouts + rating prompt (S8)
on_rating_submitted(move_id, uid)  # surfaces fires; muse: taste update (M8)
```

Who implements which port, who consumes it:

| Port | Implemented by | Consumed by |
| --- | --- | --- |
| `Clock`, `EventPublisher` | core | all |
| `Notifier` | muse | core (C8), surfaces (S2, S8) |
| `MoveGateway`, `MarkGateway` | core | muse (M4, M6, M7, M10), surfaces (S2, S3, S4, S8, S9, S10) |
| `MuseGateway` | muse | core (C5), surfaces (S4, S9, S10) |
| `ProximityGateway` | surfaces | muse (M4, M10) |
| `CalendarGateway` | surfaces | muse (M7) |

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

## 7. Open items

- **Muse API shape**: verified by M1 on 2026-11-12 with live calls.
  - Anthropic Messages-compatible: `POST https://api.meta.ai/v1/messages`, header `Authorization: Bearer <MUSE_API_KEY>`, `anthropic-version: 2023-06-01`. Model id `muse-wonder-1.0` (the only one offered).
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
| C10 | Seed core: users, friends, circles, marks, live Moves, ghosts, Moments | P0 | M0 | T0, C1, C3 | [#11](https://github.com/axv2655/hackmeta-26/issues/11) |
| C11 | Privacy and safety test suite (section 17.3 core cases) | P0 | M1 | T0, C5, C6, C8 | [#12](https://github.com/axv2655/hackmeta-26/issues/12) |

## Lane 2: Muse (AI agents, notify pipeline, scheduler jobs)

| ID | Task | Pri | Milestone | Depends on | Issue |
| --- | --- | --- | --- | --- | --- |
| M1 | MuseClient, HttpMuseClient, FakeMuseClient, agent runner, muse_runs log | P0 | M0 | T0 | [#13](https://github.com/axv2655/hackmeta-26/issues/13) |
| M2 | Affinity math and compact Muse context builder | P0 | M1 | T0, M1 | [#14](https://github.com/axv2655/hackmeta-26/issues/14) |
| M3 | Notify picker agent with prompt and fallback | P0 | M2 | T0, M1, M2 | [#15](https://github.com/axv2655/hackmeta-26/issues/15) |
| M4 | Notify pipeline, Notifier implementation, notifications routes | P0 | M2 | T0, M3 | [#16](https://github.com/axv2655/hackmeta-26/issues/16) |
| M5 | Move writer, place resolver, compose-move | P0 | M2 | T0, M1 | [#17](https://github.com/axv2655/hackmeta-26/issues/17) |
| M6 | Move ranker agent and MuseGateway.rank_moves | P0 | M2 | T0, M2 | [#18](https://github.com/axv2655/hackmeta-26/issues/18) |
| M7 | Suggestions + flare agent + scheduler job | P1 | M2 | T0, M2, M4 | [#19](https://github.com/axv2655/hackmeta-26/issues/19) |
| M8 | Taste agent, taste profiles, suggest-spots | P1 | M3 | T0, M1, M2 | [#20](https://github.com/axv2655/hackmeta-26/issues/20) |
| M9 | Pseudo-group detection and revive agent | P1 | M3 | T0, M2 | [#21](https://github.com/axv2655/hackmeta-26/issues/21) |
| M10 | Nobody-bit agent and trigger job | P1 | M3 | T0, M2, M4 | [#22](https://github.com/axv2655/hackmeta-26/issues/22) |
| M11 | Route and intent agents | P2 | M5 | T0, M1 | [#23](https://github.com/axv2655/hackmeta-26/issues/23) |

## Lane 3: Surfaces (proximity, Reels, calendar, ratings, leaderboards, glasses, demo control)

| ID | Task | Pri | Milestone | Depends on | Issue |
| --- | --- | --- | --- | --- | --- |
| S1 | Proximity: tokens, sightings ingest, copresence, ProximityGateway | P1 | M4 | T0 | [#24](https://github.com/axv2655/hackmeta-26/issues/24) |
| S2 | Proximity sweep: join prompt, auto-join, exclusion | P1 | M4 | T0, S1 | [#25](https://github.com/axv2655/hackmeta-26/issues/25) |
| S3 | Open Moves discovery over BLE | P2 | M5 | T0, S1 | [#26](https://github.com/axv2655/hackmeta-26/issues/26) |
| S4 | Reels: list, place chip, save to Saved Mark | P1 | M4 | T0 | [#27](https://github.com/axv2655/hackmeta-26/issues/27) |
| S5 | Calendar: mock events, busy blocks, free window, CalendarGateway | P1 | M4 | T0 | [#28](https://github.com/axv2655/hackmeta-26/issues/28) |
| S6 | Pairwise ranking domain and rating service | P1 | M3 | T0 | [#29](https://github.com/axv2655/hackmeta-26/issues/29) |
| S7 | Leaderboards: top spots and my list | P1 | M3 | T0, S6 | [#30](https://github.com/axv2655/hackmeta-26/issues/30) |
| S8 | Move-ended handler: hangouts and rating prompt | P1 | M3 | T0 | [#31](https://github.com/axv2655/hackmeta-26/issues/31) |
| S9 | Glasses: command and confirm | P2 | M5 | T0 | [#32](https://github.com/axv2655/hackmeta-26/issues/32) |
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
- `backend/app/lanes/**`
- `backend/app/scheduler/loop.py`
- `backend/app/seed/ids.py`
- `backend/app/api/main.py`
- `backend/tests/conftest.py`
- `backend/tests/contract/**`

### Build
- Add deps: `sqlmodel`, `httpx` (runtime), `python-multipart`.
- `app/tables/{core,muse,surfaces}.py`: every table from section 5, columns only, no logic. Re-export from `app/tables/__init__.py`. Split by write-owner: core = users, friendships, circles, circle_members, blocks, user_settings, autojoin_prefs, marks, saved_marks, moves, move_audience, move_audience_circles, move_participants, moments, moment_tags; muse = muse_runs, taste_profiles, pseudo_groups, suggestions, notifications; surfaces = proximity_sightings, copresence, hangouts, ratings, mark_rankings, calendar_events, reels, saved_reels.
- Rule: a lane WRITES only its own tables. Reading any table is fine. Cross-lane behavior goes through ports only.
- `app/ports.py`: frozen dataclasses `MoveSnapshot`, `ParticipantSnapshot`, `MarkSnapshot`, `FreeWindow`, `NotifyPickOut`, `MoveDraftOut`, `RankedMove`, `PlaceResolution`, `Intent`, `SuggestionSnapshot`, plus Protocols `Clock`, `EventPublisher`, `Notifier`, `MoveGateway`, `MarkGateway`, `MuseGateway`, `ProximityGateway`, `CalendarGateway` (signatures in docs/BACKEND_TASKS.md section 3).
- `app/ports_null.py`: a safe no-op implementation of every port so the app boots and every lane runs with the other two lanes absent.
- `app/hooks.py`: registry with `on_move_created(move_id)`, `on_move_joined(move_id, user_id)`, `on_move_ended(move_id)`, `on_rating_submitted(move_id, user_id)`. Handlers run in registration order; an exception in one is logged and swallowed so one lane never breaks another.
- `app/container.py` (holds one slot per port, defaults from `ports_null`) and `app/lanes/{core,muse,surfaces}.py`, each exposing `register(container, hooks, scheduler)`. `main.py` lifespan calls all three. Each lane edits ONLY its own `lanes/<lane>.py` to wire itself in.
- `scheduler/loop.py`: generic asyncio loop with `scheduler.register(name, fn, interval_s)`. Lanes register their own jobs; nobody edits the loop.
- Empty stub routers for every route module in section 4, already included in `api/main.py`, so no lane ever edits `main.py` again.
- `seed/ids.py`: stable string IDs for the demo cast (anish, tony, maya, priya, dev, dhivyesh, jordan, mom, hs_*) and key Marks (kumo_matcha, climbing_gym, pickleball_court, ...). `seed/seed.py` runner calls `seed.core`, `seed.history`, `seed.surfaces` in that order (each owned by a lane).
- `tests/conftest.py`: function-scoped in-memory SQLite engine + session fixture. Per-lane dirs `tests/{core,muse,surfaces}/` each with an empty `fakes.py` and `factories.py`.
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
- `clock.py`: `SystemClock` plus `DemoClock` with `set_time(iso)` / `shift(minutes)`; this is the only place `datetime.now()` appears. Registers itself as the `Clock` port.

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
- `backend/tests/core/test_privacy.py`

### Build
- Pure `can_see(viewer, move_ctx)`: true iff creator, participant, or in `move_audience`, and not blocked by creator.
- `resolve_audience(creator, circle_ids, user_ids, blocks)`: union of circle members and direct picks, minus blocks, minus self.
- `POST /audience/preview` returning `AudienceSummary` (blocked users never listed).

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
- Repository with visibility-joined queries only (always join `move_audience`; no 'list all'). Methods: create, get_visible, list_live_visible, participants, add/update participant.

### Acceptance
- [ ] No repository method returns a Move without a viewer-visibility join, except the internal by-id fetch used by services.

### Tests
- Every transition, including illegal ones.
- Stale detection at boundary times.



## C4: MoveService: create/join/arrive/leave/end, MoveGateway, hooks ([#5](https://github.com/axv2655/hackmeta-26/issues/5))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1), #3 (C2), #4 (C3)
**Spec:** ARCHITECTURE.md 7.2, 7.3, 9.1

### You own
- `backend/app/services/moves.py`
- `backend/tests/core/test_move_service.py`

### Build
- `create`: resolve audience, store Move, add creator participant (there/going), fire `on_move_created`, publish `move.created` to audience via `EventPublisher`.
- `join`, `arrive`, `leave`, `end`: publish `participant.changed` / `move.updated` / `move.ended`; fire `on_move_joined`, `on_move_ended`.
- `end_stale()` registered as a scheduler job in `lanes/core.py`.
- Implement and register the `MoveGateway` port.

### Ports you consume (fake them in your tests)
- EventPublisher (fake)
- Clock

### Acceptance
- [ ] Hooks fire exactly once per event.
- [ ] Works with null Notifier, null EventPublisher and no hook handlers.

### Tests
- Service tests with fake clock and recording publisher/hook registry.
- Auto-end of stale Move; Move with all participants left ends.



## C5: Moves routes: create, detail, join/arrive/leave/end, feed, nearby ([#6](https://github.com/axv2655/hackmeta-26/issues/6))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #5 (C4)
**Spec:** ARCHITECTURE.md 7.1, 14.2

### You own
- `backend/app/api/routes/moves.py`
- `backend/tests/core/test_moves_routes.py`

### Build
- `POST /moves`, `GET /moves/{id}`, `POST /moves/{id}/{join,arrive,leave,end}`, `GET /moves/feed`.
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
- Implement the `MarkGateway` port (`get`, `nearest`, `save`) used by Reels and glasses.

### Acceptance
- [ ] Ghosts never show to non-audience viewers.
- [ ] Mark detail works with empty rankings.

### Tests
- Ghost window boundary (23h vs 25h).
- Save/unsave idempotent.



## C7: Users, auth picker, settings, friends, blocks, auto-join ([#8](https://github.com/axv2655/hackmeta-26/issues/8))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1)
**Spec:** ARCHITECTURE.md 5.1, 12.2, 14.2

### You own
- `backend/app/services/users.py`
- `backend/app/api/routes/{auth,users}.py`
- `backend/app/api/deps_core.py`
- `backend/tests/core/test_users.py`

### Build
- `GET /auth/users`, `GET /me`, `PATCH /me/settings`, `GET /friends`, `/me/blocks` (GET/POST/DELETE), `/me/autojoin` (GET/PUT).
- `X-User-Id` dependency that resolves the current user (404/401 on unknown).
- Circles CRUD: `GET/POST /circles`, `PATCH/DELETE /circles/{id}`.

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
- Serve `/media/*` from `backend/data/uploads` with `StaticFiles`.
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

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0), #2 (C1), #4 (C3)
**Spec:** ARCHITECTURE.md 15.1

### You own
- `backend/app/seed/core.py`
- `backend/app/seed/assets/**`
- `backend/tests/core/test_seed_core.py`

### Build
- Write rows directly to the core-owned tables using IDs from `seed/ids.py`.
- 12 to 15 users with the demo cast, friendships, Anish's four Circles (Climbing tagged as a Facebook Group), 30 to 40 Marks around the demo center (constant at top of file), Mom blocked from Anish's Moves, settings.
- Live state: Tony's live Move at Kumo Matcha with 2 others; Jordan's open pickleball Move; ghosts and seeded Moments at another Mark from last night.
- Does NOT write hangouts, ratings, rankings, reels, calendar (those belong to surfaces seed).

### Acceptance
- [ ] `uv run python -m app.seed.seed` leaves a valid core world when the other seed modules are empty.

### Tests
- Seed is idempotent after a reset; expected counts and cast present.



## C11: Privacy and safety test suite (section 17.3 core cases) ([#12](https://github.com/axv2655/hackmeta-26/issues/12))

**Lane:** `core`  |  **Priority:** P0  |  **Milestone:** M1  |  **Depends on (same lane or T0 only):** #1 (T0), #6 (C5), #7 (C6), #9 (C8)
**Spec:** ARCHITECTURE.md 12.1, 17.3

### You own
- `backend/tests/core/test_privacy_suite.py`

### Build
- Blocked user and non-audience friend cannot fetch a Move by id, in nearby, in feed, as a ghost, or via Moments.
- Introspect every Pydantic response model in `app/models/**` (all lanes) and assert no field named lat/lng belongs to a user-typed model; Mark coordinates are allowed.

### Acceptance
- [ ] Suite is deterministic and uses only core fakes and factories.

### Tests
- As described; no dependence on other lanes' implementations.



## M1: MuseClient, HttpMuseClient, FakeMuseClient, agent runner, muse_runs log ([#13](https://github.com/axv2655/hackmeta-26/issues/13))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M0  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 3.2, 10.2, 10.12

### You own
- `backend/app/muse/{client,runner}.py`
- `backend/tests/muse/test_runner.py`

### Build
- FIRST: verify the real Muse API (base URL, auth, model id, JSON mode, vision) and record findings in docs/BACKEND_TASKS.md section 6. Only `HttpMuseClient.complete()` knows the wire format.
- `run_agent(agent, user_id, prompt, schema, fallback, images=None, max_tokens)`: JSON extract, Pydantic validate, 6s timeout, one retry, then `fallback()`; always write `muse_runs`; 60s cache by prompt hash.
- `FakeMuseClient` returning canned or programmable outputs, and `DEMO_MODE=offline` that forces it.
- `get_stats()` for calls, tokens, fallback rate, last outputs (used by the demo route via `MuseGateway.muse_stats`).

### Acceptance
- [ ] Garbage output, timeout and transport error each return the fallback and log a run.

### Tests
- Valid, invalid, slow and erroring fake clients.
- Cache hit does not call the client.



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
- Output `{picks:[{user,copy,reason}], skipped_note}`; cap `min(8, ceil(audience/2))`; one stretch pick when signals allow; never busy people; unverified users never stretch picks.
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
- Register handlers on `on_move_created` and `on_move_joined` (second-order nudge to the joiner's close friends in the audience; never widens audience).
- Implement and register the `Notifier` port (store + publish `notification`).
- `GET /notifications`, `POST /notifications/read`, `POST /muse/notify-preview`; `MuseGateway.notify_move`.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- ProximityGateway (fake)
- EventPublisher (fake)

### Acceptance
- [ ] Participants and the co-present cluster are never notified.
- [ ] Works with null proximity and fake Muse.

### Tests
- Pipeline with fake MoveGateway, ProximityGateway, EventPublisher.
- Quiet hours, duplicates, forced adds.



## M5: Move writer, place resolver, compose-move ([#17](https://github.com/axv2655/hackmeta-26/issues/17))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1)
**Spec:** ARCHITECTURE.md 10.4, 7.2

### You own
- `backend/app/muse/agents/{move_writer,place_resolver}.py`
- `backend/app/muse/prompts/**`
- `backend/tests/muse/test_writer_resolver.py`

### Build
- Writer: lowercase casual text under 60 chars, category, 3 alternates; fallback template per category.
- Resolver: geotag/caption/frame + 10 nearest Marks -> `{mark_id|new_mark, confidence}`; text-only fallback when no vision; `confidence < 0.6` flagged for 'Is this X?'.
- `POST /muse/compose-move` -> `MoveDraft` (uses `MarkGateway.nearest`); implement `MuseGateway.compose_move` and `resolve_place`.

### Ports you consume (fake them in your tests)
- MarkGateway (fake)

### Acceptance
- [ ] Heuristic draft returns instantly; Muse result replaces it when it lands.

### Tests
- Length/format validation, low-confidence flag, fallback.



## M6: Move ranker agent and MuseGateway.rank_moves ([#18](https://github.com/axv2655/hackmeta-26/issues/18))

**Lane:** `muse`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2)
**Spec:** ARCHITECTURE.md 10.5

### You own
- `backend/app/muse/agents/move_ranker.py`
- `backend/tests/muse/test_ranker.py`

### Build
- Rank up to 15 Moves with one-line reason; 45s per-user cache; fallback sorts by max participant affinity.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)

### Acceptance
- [ ] Every input Move appears exactly once in the output.

### Tests
- Missing/duplicate IDs from Muse are repaired; fallback order.



## M7: Suggestions + flare agent + scheduler job ([#19](https://github.com/axv2655/hackmeta-26/issues/19))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2), #16 (M4)
**Spec:** ARCHITECTURE.md 10.6, 11.2

### You own
- `backend/app/muse/agents/flare.py`
- `backend/app/services/suggestions.py`
- `backend/app/api/routes/suggestions.py`
- `backend/tests/muse/test_flare.py`

### Build
- Job every 60s: users with `muse_proactive`, free window from `CalendarGateway`, saved Marks not flared in 3 days, pseudo-group members who are free.
- Rules: window < 60 min means 5 to 10 min fill; max 2 per user per day; no quiet hours; dismissed Mark suppressed a week.
- `GET /suggestions`, `POST /suggestions/{id}/accept` (creates the Move via `MoveGateway.create`, kind=flare), `/dismiss`. `MuseGateway.run_flare_scan`.

### Ports you consume (fake them in your tests)
- CalendarGateway (fake)
- MoveGateway (fake)
- Clock

### Acceptance
- [ ] Accept creates a flare with fill_deadline; Muse never posts without the tap.

### Tests
- Daily cap, suppression, window math with fake clock and fake CalendarGateway.



## M8: Taste agent, taste profiles, suggest-spots ([#20](https://github.com/axv2655/hackmeta-26/issues/20))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1), #14 (M2)
**Spec:** ARCHITECTURE.md 10.7

### You own
- `backend/app/muse/agents/taste.py`
- `backend/app/services/taste.py`
- `backend/tests/muse/test_taste.py`

### Build
- Register a handler on `on_rating_submitted`; update `taste_profiles` for the rater and the attending pseudo-group.
- `POST /muse/suggest-spots` returns 3 Marks with reasons; fallback by shared vibe tags and rankings.

### Ports you consume (fake them in your tests)
- MarkGateway (fake)

### Acceptance
- [ ] Profile summary/likes/dislikes always valid, even on fallback.

### Tests
- Update from fixture ratings; fallback spots.



## M9: Pseudo-group detection and revive agent ([#21](https://github.com/axv2655/hackmeta-26/issues/21))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2)
**Spec:** ARCHITECTURE.md 10.8

### You own
- `backend/app/domain/pseudo_groups.py`
- `backend/app/muse/agents/revive.py`
- `backend/app/api/routes/pseudo_groups.py`
- `backend/tests/muse/test_revive.py`

### Build
- Pure clustering of `hangouts` into recurring sets of 2 to 6 with a pattern; `fading` when last hangout older than 2.5x usual gap (min 14 days).
- Revive agent at most once a week per user; `GET /pseudo-groups` with history sparkline data; `POST /pseudo-groups/{id}/revive` -> `MoveDraft`; `MuseGateway.run_revive_scan`.

### Acceptance
- [ ] The climbing crew from seed-shaped fixtures is detected as fading.

### Tests
- Clustering on hand-built hangouts, fading threshold, weekly cap.



## M10: Nobody-bit agent and trigger job ([#22](https://github.com/axv2655/hackmeta-26/issues/22))

**Lane:** `muse`  |  **Priority:** P1  |  **Milestone:** M3  |  **Depends on (same lane or T0 only):** #1 (T0), #14 (M2), #16 (M4)
**Spec:** ARCHITECTURE.md 10.9

### You own
- `backend/app/muse/agents/nobody_bit.py`
- `backend/tests/muse/test_nobody_bit.py`

### Build
- Job: flare past `fill_deadline` with no joiners, or a Move with no joiners 15 min after posting.
- Candidates: `MoveGateway.list_live_visible` plus `ProximityGateway.open_moves_near`; nothing else is ever suggested. No candidates means send nothing.
- Accept joins the other Move and ends the empty one. `MuseGateway.run_nobody_bit`.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- ProximityGateway (fake)

### Acceptance
- [ ] Never produces a 'nobody came' message.

### Tests
- No candidates, one candidate, open Move candidate, fallback.



## M11: Route and intent agents ([#23](https://github.com/axv2655/hackmeta-26/issues/23))

**Lane:** `muse`  |  **Priority:** P2  |  **Milestone:** M5  |  **Depends on (same lane or T0 only):** #1 (T0), #13 (M1)
**Spec:** ARCHITECTURE.md 10.10, 10.11

### You own
- `backend/app/muse/agents/{route,intent}.py`
- `backend/tests/muse/test_route_intent.py`

### Build
- Intent: utterance -> `{intent, text, audience_hint}`; heuristic keyword fallback. `MuseGateway.parse_intent`.
- Route: two `going` audience members from the same coarse area, not walkable -> one suggestion; `MuseGateway.run_route`.

### Acceptance
- [ ] Both agents work with FakeMuseClient and fall back cleanly.

### Tests
- Intent phrases; route eligibility rules.



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
- Implement `ProximityGateway.copresent_cluster` (connected component) and `open_moves_near`.

### Ports you consume (fake them in your tests)
- Clock

### Acceptance
- [ ] Never exposes a 'who is near me' list; raw sightings purged.

### Tests
- Token expiry, RSSI filter, friends-only, cluster math, purge with fake clock.



## S2: Proximity sweep: join prompt, auto-join, exclusion ([#25](https://github.com/axv2655/hackmeta-26/issues/25))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M4  |  **Depends on (same lane or T0 only):** #1 (T0), #24 (S1)
**Spec:** ARCHITECTURE.md 8.3, 8.4

### You own
- `backend/app/services/proximity_sweep.py`
- `backend/tests/surfaces/test_sweep.py`

### Build
- Handler on `on_move_created` and on copresence change: cluster members in the audience but not participants get a `proximity.prompt` event, or are added `there` (`ble_auto`) if on the auto-join list, with a quiet `proximity_added` notification.
- `POST /proximity/prompt/{move_id}/accept` body `{always}`; joins via `MoveGateway.add_participant(joined_via=ble_prompt)` and stores the auto-join pref through the core table API.
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
- Joining adds them via `MoveGateway.add_participant(joined_via=open_ble)`. Unverified users cannot discover or join.

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
- `GET /reels`, `GET /reels/{id}/place` (mark, distance, active friend Move summary, draft) using `MuseGateway.resolve_place` once per Reel and caching `resolved_mark_id`.
- `POST/DELETE /reels/{id}/save` via `MarkGateway.save(source=reel)`.
- Works when Muse is unavailable: geotag, then nearest Mark by caption text.

### Ports you consume (fake them in your tests)
- MuseGateway (fake)
- MarkGateway (fake)
- MoveGateway (fake)

### Acceptance
- [ ] Active-Move summary only reflects Moves the viewer can see (through `MoveGateway.list_live_visible`).

### Tests
- Friends-there path, nobody-there path, resolver fallback.



## S5: Calendar: mock events, busy blocks, free window, CalendarGateway ([#28](https://github.com/axv2655/hackmeta-26/issues/28))

**Lane:** `surfaces`  |  **Priority:** P1  |  **Milestone:** M4  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 10.6, 12.1

### You own
- `backend/app/services/calendar.py`
- `backend/app/api/routes/calendar.py`
- `backend/tests/surfaces/test_calendar.py`

### Build
- `GET /calendar`, `PUT /calendar/busy` (start/end only, never titles).
- Pure `free_window(events, now, min_minutes=20)`; implement `CalendarGateway.free_window`.

### Ports you consume (fake them in your tests)
- Clock

### Acceptance
- [ ] The server never stores titles from a device calendar.

### Tests
- Gap before a 3:00 class, back-to-back events, no window.



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



## S9: Glasses: command and confirm ([#32](https://github.com/axv2655/hackmeta-26/issues/32))

**Lane:** `surfaces`  |  **Priority:** P2  |  **Milestone:** M5  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 11.4

### You own
- `backend/app/services/glasses.py`
- `backend/app/api/routes/glasses.py`
- `backend/tests/surfaces/test_glasses.py`

### Build
- `POST /glasses/command`: `MuseGateway.parse_intent` -> nearest Mark (`MarkGateway.nearest`) -> `compose_move` + `notify_move` preview -> draft with a spoken confirmation line.
- `POST /glasses/confirm` posts via `MoveGateway.create(origin=glasses)`. Non-start intents return a friendly no-op.

### Ports you consume (fake them in your tests)
- MuseGateway (fake)
- MarkGateway (fake)
- MoveGateway (fake)

### Acceptance
- [ ] Nothing posts before confirm.

### Tests
- Start-a-Move utterance, unrelated utterance, confirm.



## S10: Demo Control routes (/demo/*), DEMO_MODE only ([#33](https://github.com/axv2655/hackmeta-26/issues/33))

**Lane:** `surfaces`  |  **Priority:** P0  |  **Milestone:** M2  |  **Depends on (same lane or T0 only):** #1 (T0)
**Spec:** ARCHITECTURE.md 15.2

### You own
- `backend/app/api/routes/demo.py`
- `backend/app/services/demo.py`
- `backend/tests/surfaces/test_demo.py`

### Build
- Routes: reset, time, flare-scan, free-time, revive-scan, copresence, friend-move, friend-join, end-move, nobody-bit, route, muse-stats.
- Every trigger calls the same gateway/service code path as production (`MoveGateway`, `MuseGateway.run_*`, `ProximityGateway`). No duplicate logic.
- Reset calls the seed runner. All routes return 404 unless `DEMO_MODE` is set.

### Ports you consume (fake them in your tests)
- MoveGateway (fake)
- MuseGateway (fake)
- ProximityGateway (fake)
- Clock

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
- Write directly to surfaces-owned tables using IDs from `seed/ids.py` (it may insert ended Moves it needs as history rows).
- 8 weeks of history with the deliberate patterns: Anish+Priya(+Tony) matcha weekday afternoons; Anish+Tony+Maya lunch; Anish+Maya+Dev climbing Thursdays that stopped 4 weeks ago; HS friends one hangout 6 weeks ago.
- Ratings and rankings so boards and taste have signal; 4 Reels (Kumo geotag, nobody-there Mark, caption-only); Anish's calendar with the 2:10 to 3:00 gap; his saved Kumo Reel from 3 days ago.

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
- Wire the real implementations and run the demo script end to end through HTTP and WebSocket: post Move -> audience/notify -> join -> second-order nudge -> end -> rating -> leaderboard; flare scan -> accept; nobody-bit.
- Also: notify pipeline excludes the co-present cluster with real S1/S2; ranking fallback with real C5 and M6; the Muse-offline mode (`DEMO_MODE=offline`) completes the same script.

### Acceptance
- [ ] Lives only in `tests/integration/`, is not part of any lane's CI gate, and is run by all three people together.

### Tests
- N/A (this is the test task).


