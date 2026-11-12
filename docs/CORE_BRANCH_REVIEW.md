# Core branch architecture review

Reviewed 2026-11-12 against root `ARCHITECTURE.md`,
`backend/ARCHITECTURE.md`, and `docs/BACKEND_TASKS.md`.
Implementation inspected at `d347385`. The working tree was clean before review.

## Verdict

The core backend is feasible and its exercised flows work on a real Uvicorn
server. This is a T0 + C1–C11 implementation, not the complete product described
by the root architecture. Muse and Surfaces registrations are empty and their
ports remain null. Their missing behavior is expected for this lane.

The branch does **not** match every architectural detail. The differences below
remain open; this review does not change application behavior or implement
another lane's features.

## Findings

1. **Creation ordering needs reconciliation before lane integration.**
   `backend/app/services/moves.py:337` commits, publishes events, then fires
   hooks. Section 7.2 specifies proximity sweep, notification pipeline, then
   `move.created`. Additionally, `backend/app/main.py:17` registers Muse before
   Surfaces, and hooks execute in registration order. When both lanes implement
   their documented subscriptions, notification selection will precede the
   proximity sweep. This risks nudging people before their proximity join has
   been processed. Establish proximity → notify → creation publication ordering
   during integration; account for the fact that port implementations must all
   be registered before handlers run. This is currently latent because those
   handlers do not exist.

2. **The task document's port signatures are stale.**
   `docs/BACKEND_TASKS.md` section 3 describes synchronous MoveGateway mutations;
   `backend/app/ports.py` requires awaiting create, add_participant, end and
   end_stale. The implemented contract also adds TimeControl, UserGateway and
   MarkGateway operations. Other lane implementations must use `ports.py`, not
   copy the illustrative signatures from the task document: a non-awaited
   mutation will not execute. Align the shared documentation before handing off.

3. **Uploaded media deliberately differs from the documented contract.**
   Sections 14.2 and C8 describe `/media/*` with StaticFiles. The running app
   returns `/api/v1/media/<filename>` and requires `X-User-Id`, enforcing the same
   Moment visibility as JSON endpoints. Direct requests to the documented root
   path will not resolve. Preserve the authorization checks and document the
   actual URL; image clients must send the header. Replacing this with a public
   StaticFiles mount would undermine pending-Moment approval.

   **Status: resolved (Task 7).** `GET /media/{filename}` is the canonical
   authenticated route; `/api/v1/media/...` is an alias with the same policy and
   both send `Cache-Control: private, no-store`.

4. **C10 does not provide the specified local seed media assets.**
   `backend/app/seed/core.py:77` and `:660` use external Picsum placeholder URLs
   for Mark photos and seeded Moments; there is no bundled `seed/assets` world.
   This leaves image rendering dependent on external connectivity, and seeded
   Moment URLs do not exercise the protected upload-serving path. Real uploads
   do use that path. Local demo media remains a C10 gap; external image fetching
   was not verified in this review.

   **Status: resolved (Task 7).** Marks use bundled, category-keyed public images
   at `/media/seed/marks/...`; seeded Moments are materialized into `MEDIA_DIR` from
   `app/seed/assets` and served only through the authorized route. No external hosts.

5. **The original backend layering guide no longer describes all core code.**
   It says services depend only on repository Protocols and domains import only
   the standard library. MoveService constructs SQL repositories and operates
   on a Session; users, circles and Moments also use SQLModel directly. Move
   rules import the shared, standard-library-only `app.ports` vocabulary and
   domain errors. HTTP schemas live mostly in route modules instead of
   `app/models.py`. These differences do not prevent this SQLite demo from
   working, but storage replacement is not the one-adapter change promised by
   the template guide. Record the chosen layering or refactor intentionally.

6. **The optional coarse area update is absent.**
   Section 12.1 describes storing a nearest-area `last_area` label for users who
   opt into location. The table has that column, but the nearby route never
   updates it. Coordinates are rounded for Move discovery and are not written
   to user rows. This is a specification gap, not a reason to start collecting
   additional location data implicitly.

## Core coverage

| Task | Implementation and review evidence |
| --- | --- |
| T0 | Tables, ports/nulls, container, hooks, scheduler, lane registration, seed runner and router modules exist. Contract documentation drift noted above. Empty foreign router modules do not expose working foreign endpoints. |
| C1 | SQLite creation/reset and injected clocks exist. Fresh file database seeded and real app booted. DemoClock implementation inspected; Demo Control HTTP endpoints belong to S10 and are absent. |
| C2 | Audience resolution, block exclusion, preview and visibility implemented; preview matched the posted audience over HTTP. |
| C3–C4 | Lifecycle rules, repository, gateway and hooks implemented; join/arrive/leave/end and actual scheduled expiry exercised. Hook ordering caveat above. |
| C5 | Create/detail/actions/feed/nearby present and exercised with null Muse ranking. Real Muse error/timeout behavior was not injected in this live check. |
| C6 | Mark creation/search/detail, save/unsave, saved list and ghosts exercised; score data is absent until Surfaces writes rankings. |
| C7 | Auth picker, settings, friends, circles, blocks and autojoin exercised, including unauthorized circle edits. |
| C8 | Multipart upload, tag approval and authenticated media exercised; pending and blocked viewers denied. No real notification storage/delivery until M4 supplies Notifier. |
| C9 | Real sockets received creation and participant events; a blocked socket received no creation event. Scheduler event also received. |
| C10 | Seed runner produced 14 users and the expected live/ended demo scenarios. Local media gap above. |
| C11 | Privacy suite exists and was inspected; runtime privacy checks were performed independently of pytest. This review does not claim every privacy edge case was exercised. |

## Runtime verification

Installed the locked backend dependencies and launched a real Uvicorn process on
`127.0.0.1:8765`, with a separate database and uploads folder under
`/tmp/hackmeta-core-review`. No application DB, dependency overrides, TestClient,
or test fixtures were used. The backend's foreign ports were its normal null
implementations; no external AI/service integration was claimed.

The direct HTTP/WebSocket exercise passed 50 counted HTTP requests, plus an
additional pending-media denial request, covering:

- Health, 14-user picker, missing/unknown auth rejection and core read endpoints.
- Settings updates, autojoin preferences, Circle creation/update/delete and
  owner-only editing. Deleting the Circle retained a posted Move's audience.
- Mark creation, repeated save, unsave, search and saved/nearby reads.
- Audience preview excluding Mom, Move creation, join/repeated join, arrival,
  leave, creator-only end, disappearance from the live feed and ghost creation.
- Multipart photo upload with Tony tagged; pending content hidden from Priya;
  approval unlocking JSON and photo bytes; blocks denying both detail and media;
  unblock restoring access.
- Real WebSocket creation/participant events and blocked-socket exclusion.

A separate scheduler exercise created a Move over HTTP, backdated its start and
participant timestamps in the throwaway SQLite file, then waited for the real
60-second scheduler job. It received `move.ended` with reason `stale` over a real
WebSocket and confirmed `ended` over HTTP. No simulated clock or direct service
call triggered expiry.

`ruff check .` passed. Pytest was not used as evidence for these runtime results.
The installed Postman CLI rejected `postman status` as an unknown command; no
Postman workspace was created or published. Direct HTTP/WebSocket clients were
sufficient for this core-only verification.

To run an isolated server again from `backend/` (the seed command resets only
the database selected by DB_PATH):

```sh
DB_PATH=/tmp/hackmeta-review-new/app.db MEDIA_DIR=/tmp/hackmeta-review-new/uploads uv run python -m app.seed.seed
DB_PATH=/tmp/hackmeta-review-new/app.db MEDIA_DIR=/tmp/hackmeta-review-new/uploads uv run uvicorn app.main:app --host 127.0.0.1 --port 8765
```

## Intentionally pending

M1–M11, S1–S11, Z1 integration and the product frontend are outside this core
review's implementation scope. In particular, null Muse ranking is not proof
of AI ranking, an emitted lifecycle hook is not proof of notification delivery
or hangout creation, and `DEMO_MODE` alone does not implement `/demo/*`.
The architecture's “nudge me next time” preference also has no corresponding
core task/API/schema contract; it was not invented or implemented here.

## CLI follow-up

Postman was subsequently updated from 1.76.0 to 1.88.0. Five real-server requests passed ten assertions (health, create/join/end and hidden-user rejection). The expected 404 assertion passed although the CLI returned exit 1 for that response. `postman status` works outside the macOS sandbox; local requests need no login.


## Final status (core alignment plan, tasks 1-9)

All findings above are resolved or have an explicit dependency: creation ordering,
async port documentation, canonical authenticated media, bundled seed media,
repository/transaction boundaries, the models package, and the consent-gated
`last_area` label. Live evidence: `docs/CORE_RUNTIME_VERIFICATION.md`
(`backend/scripts/check_core_live.py`, Postman CLI 1.88.0, local, no login needed).
Remaining dependencies are the other lanes (Muse, Surfaces, frontend) and Z1 integration.
