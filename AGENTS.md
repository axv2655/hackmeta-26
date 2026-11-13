# AGENTS.md

## Project

**Spontaneous** (feature name: **Moves**), a Meta Career Programs AI Hackathon 2026 entry. We mock a
Facebook surface; we never touch real Facebook code. Judging is a live demo to five judges, submission
**Friday 10:30 a.m.**

A **Move** is a post of what you are already doing ("I'm going to Chipotle"). Friends **pull up** with one
tap. A **Mark** is a place pin on a map that shows activities at places, never people's live positions.
**Muse** (the hackathon model API, required to power the core AI) decides who is notified, ranks Moves,
proposes Flares for calendar gaps, learns taste from ratings, and revives fading groups.

`ARCHITECTURE.md` is the single source of truth. Read sections 1 to 5, then the sections your issue cites. If
you diverge from it, update it in the same change. `docs/BACKEND_TASKS.md` splits the backend into three
lanes (core, muse, surfaces) with GitHub issues T0, C1-C11, M1-M11, S1-S11, Z1. `PROMPTS.md` holds
implementation prompts for the **surfaces** lane only (S1-S11, issues #24-#34).

## Stack

- `frontend/`: Expo SDK 57, React Native 0.86, React 19, TypeScript, expo-router, zustand. The app is `frontend/mobile`.
  Currently a Hello-world scaffold. Needs an Expo dev build for BLE; must also run in Expo Go with BLE simulated.
- `backend/`: FastAPI, Python >= 3.12, uv. SQLModel over SQLite planned. Layered template.
- Realtime is one WebSocket per client, server push only. Auth is mocked: pick a seeded user, send `X-User-Id`.

## Commands

```sh
# backend
cd backend && uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0      # docs at :8000/docs
uv run pytest && uv run ruff check . && uv run ruff format --check .

# frontend
cd frontend && npm ci && npx expo start
```

Use `npx expo install <pkg>` so versions match SDK 57. Set `EXPO_PUBLIC_BACKEND_URL` to override LAN
discovery. Flags: `EXPO_PUBLIC_PROXIMITY=ble|sim`, `EXPO_PUBLIC_DEMO=1`, backend `DEMO_MODE`.

## Vocabulary (use these exact words in code and UI)

Move, Mark, Saved Mark, Pull up, Flare, Ghost, Moment, Circle, Pseudo-group, Open Move.

## Product rules (non-negotiable, ARCHITECTURE.md 1.5)

1. Location is opt-in; the app works with every permission denied.
2. Never show live location. Raw GPS never leaves the device except a coarse, unstored "near" query. No user coordinates in any response schema.
3. Never fully public. "Open" only widens discovery to nearby people over BLE, when the poster turns it on.
4. Always obvious who will see a post (audience line before posting).
5. Proximity actions are a one-tap prompt unless the user put someone on their auto-join list.
6. Muse proposes, the user disposes. Muse never posts or sends a Flare without a tap.
7. Moments need approval from anyone tagged.

Edge cases go to the privacy pass (12.5), not the critical path. Do not build the items in section 1.6.

## Conventions

**Backend**
- Dependencies point inward: `domain/` (stdlib only) <- `services/` (use cases, ports) <- `api/` (HTTP). Adapters in `repositories/`; `api/deps.py` is the composition root. Follow `backend/ARCHITECTURE.md` "Adding a feature".
- Domain code raises domain errors; `api/errors.py` maps them to status codes. No `HTTPException` in routes.
- Visibility goes through `domain/privacy.can_see` only.
- All time reads go through `core/clock.py`; never `datetime.now()` in services (the demo shifts time).
- Muse is behind a `MuseClient` port; only `HttpMuseClient.complete()` knows the wire format. Every agent has a heuristic fallback; a failed call must never break the demo. Develop against `FakeMuseClient`; mind the $100 token budget.
- Ruff rules E, F, I. Tests under `backend/tests`, service-level first, then one HTTP round trip.
- Tests always run on an in-memory SQLite (`tests/conftest.py` forces `DB_PATH=:memory:`), never the `DATABASE_URL` in `backend/.env`. An autouse fixture there pins `settings.DEMO_MODE = None`; a test that needs Demo Control opts in with `monkeypatch.setattr(settings, "DEMO_MODE", "on")` on the shared settings object before booting the app. `tests/contract/test_plan_endpoints.py` pins every promised route and `tests/integration/test_journeys.py` walks the demo journeys with all lanes.

**Frontend**
- Server state in zustand feature stores (`lib/<feature>.ts`: `status`/`error`, `load()`, optimistic mutations with rollback, `onLogout` reset) calling `lib/endpoints.ts`; not TanStack Query. `lib/realtime.ts` forwards every envelope through `appEvents` and stores subscribe themselves. Session/settings in zustand + AsyncStorage.
- Optimistic join/leave/save with rollback. Loading, empty and error states everywhere; no red screen on a dropped socket.
- Request each permission in context; every feature has a no-permission path.
- Types in `lib/types.ts` mirror backend schemas (ARCHITECTURE.md 14).

**General**
- Immutability: return new objects, do not mutate inputs. Small files (200 to 400 lines, 800 max), functions under 50 lines.
- No hardcoded secrets; use env vars (`backend/.env`, `frontend/.env`, see `.env.example`).
- Anything depending on time, hardware or another person needs a Demo Control trigger (`/demo/*`).
- Conventional commits: `feat|fix|refactor|docs|test|chore|perf|ci: description`.

## Backend lanes and file ownership (docs/BACKEND_TASKS.md)

| Lane | Label | Owns (writes) |
| --- | --- | --- |
| Core | `lane:core` | Move lifecycle, privacy, marks, circles, users, moments, WebSocket hub, core seed |
| Muse | `lane:muse` | `muse/**`, notify pipeline, notifications, suggestions, taste, pseudo-groups, Muse scheduler jobs |
| Surfaces | `lane:surfaces` | Proximity, Reels, calendar, ratings, leaderboards, hangouts, glasses, demo control, history seed |

Rules: a lane writes only its own tables; cross-lane behaviour goes through ports in `app/ports.py` (every port has a
null implementation); lifecycle through hooks in `app/hooks.py`; each lane wires itself in `app/lanes/<lane>.py` only.
Tests live in `backend/tests/<lane>/` with the lane's own `fakes.py` and `factories.py`. Never edit another lane's
files, `ports.py`, `hooks.py`, `tables/`, `api/main.py` or `api/deps.py` (T0 owns them; changes need all three owners).
Branch `<lane>/<task-id>-name`, one PR per issue, body `Closes #<issue>`. Frontend lanes are separate from this plan.

**Waiver on `mobile/facebook-shell`:** the lane-ownership rules above are waived on this branch (owner decision).
Services there read other lanes' tables directly where needed (listed in `NOT_YET_LAYERED` in
`tests/contract/test_core_layering.py`), and `tests/contract/test_lane_isolation.py::test_no_lane_imports_another_lane`
is skipped. The `domain/ <- services/ <- api/` layering, domain errors and the Clock rule still hold.

## Definition of done

Follows 1.5; has a Demo Control trigger if needed; works with Muse down and permissions denied; service
test exists; `uv run pytest && uv run ruff check .` pass; loading/empty/error states exist.

## Tests that must exist (17.3)

Privacy (blocked/non-audience users cannot fetch a Move by id, nearby, feed, ghost or Moments); no user
coordinates in any response; notify pipeline excludes participants and the co-present cluster; Move state
machine and auto-end; each Muse agent parses valid output and falls back on garbage; stable pairwise ranking.
