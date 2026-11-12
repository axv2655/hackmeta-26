# Core Architecture Alignment Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in this session. Steps use checkbox syntax for tracking. Do not dispatch agents or implement Muse/Surfaces features as part of this plan.

**Goal:** Refactor T0 and the C1–C11 backend so its behavior, boundaries, seed assets, and documentation agree with the reference architecture, with independently repeatable live-server verification.

**Architecture:** Keep FastAPI, SQLite/SQLModel, the existing lane ports, and the existing domain rules. Inject repository contracts into services, construct SQL adapters at the composition boundary, and keep HTTP schemas separate from business rules. Commit state before side effects, run creation hooks in proximity-then-notify order, and preserve privacy at every JSON, media, and event boundary.

**Tech Stack:** Python >=3.12.11, FastAPI, SQLModel, SQLite, Pydantic, asyncio/WebSockets, uv, pytest, Ruff, Postman CLI 1.88.0.

**Spec:** [Root architecture](../../../ARCHITECTURE.md), [backend layering guide](../../../backend/ARCHITECTURE.md), [backend tasks](../../BACKEND_TASKS.md), [core branch review](../../CORE_BRANCH_REVIEW.md). Baseline implementation reviewed at `d347385`.

## Global constraints

- “Location is always opt-in.” Search and manual arrival must work without location permission.
- “Never show live location.” Coordinates in responses belong to Marks, never users.
- “Never fully public.” An open Move requires explicit nearby discovery, not inclusion in a public feed.
- “Muse proposes, the user disposes.” No new autonomous posting paths.
- “Moments need approval.” A pending Moment and its bytes are restricted to participants; blocks still apply.
- All timestamps are timezone-aware UTC and come from the injected Clock.
- Retain the 24-hour ghost window, 3-hour idle expiry, and 2-second ranking fallback budget.
- Every lane writes only its tables. Cross-lane behavior uses ports/hooks. Core works with null foreign ports.
- Preserve existing request bodies, status codes, seeded IDs, and JSON properties unless a change is explicitly listed below.
- No database reset against the developer's existing `backend/data/app.db` during verification.
- Do not implement any section 1.6 exclusion, “nudge me next time” preference contract, or unassigned privacy-screen feature.
- This plan authorizes local refactor preparation. Publishing, merging, or claiming other lane owners approved a shared contract change is not part of it.

## Review focus

1. A creation hook mutates the Move through another SQL session: creation response and final event must reflect committed state, not a stale identity map. Covered by Task 2.
2. A hook or socket fails after persistence: the successful mutation remains committed, later handlers run, and no duplicate lifecycle event is introduced. Covered by Tasks 2 and 4.
3. A tagged person withdraws approval or is blocked after an image was loaded: subsequent media requests must recheck permission, with no reusable cached private response. Covered by Tasks 6 and 7.
4. Circle edits/deletion and duplicate participant actions must not widen historical audiences or produce partial rows on failure. Covered by Tasks 4 and 5.
5. Installed-package execution with external networking unavailable must still load demo assets, seed the core world, and serve protected Moments. Covered by Tasks 7 and 9.

## Scope and decisions

This is one core-backend refactor. The full product requires separate Muse,
Surfaces, frontend, and Z1 integration work. The current working backend should
remain runnable at every task boundary.

| Review finding | Decision | Task |
| --- | --- | --- |
| Creation ordering | Commit → creation hooks (Surfaces then Muse) → refresh state/recipients → `move.created` → response | 2 |
| Port signature drift | Preserve the implemented async contract; update its documented consumers | 1 |
| Media path mismatch | Make authenticated `/media/{filename}` canonical; retain authenticated `/api/v1/media/{filename}` compatibility | 7 |
| Public StaticFiles conflicts with approval | Explicit privacy rules win; never expose uploaded or seeded private Moments through a public mount | 1, 7 |
| External seed media | Bundle local demo assets; public Mark images and private Moment files have separate paths | 7 |
| Services tied to SQL | Move SQL, sessions, and ORM mappings to adapters; inject repository contracts and a transaction boundary | 4–6 |
| Route-local schemas | Move schemas into a models package; keep current imports compatible during migration | 3 |
| `last_area` never populated | Add only the coarse, consent-gated area label already specified; document the demo area's interpretation | 8 |

The task document explicitly calls its signatures a proposal that T0 may adjust.
Do not revert async operations to match that older example. Keep `tables/` split
by ownership rather than flattening it back into `tables.py` for cosmetic parity.

The backend guide's dependency rule will be expressed precisely: domain code
may import the standard library, other pure domain modules, and the existing
standard-library-only shared port vocabulary. It may not import FastAPI,
Pydantic, SQLAlchemy/SQLModel, repositories, or services. Moving shared types out
of `ports.py` adds compatibility risk without improving this boundary.

`docs/BACKEND_TASKS.md` section 2 freezes `main.py`, `ports.py`, `hooks.py`, and
`tables/`; the review also identifies a required bootstrap ordering fix. Task 2
isolates that shared bootstrap change for review. Keep port signatures, hook
signatures, and SQL table schemas unchanged. Document the shared change for lane
owners rather than silently folding it into a core service cleanup.

## Target files and responsibilities

| Files | Responsibility |
| --- | --- |
| `app/models/{common,users,circles,audience,marks,moves,moments,notes}.py` | HTTP schemas, conversions, and response shapes |
| `app/domain/{moves,privacy,errors,people,moments,marks}.py` | Pure rules and immutable core records; existing Move/Mark shared snapshots remain in `ports.py` |
| `app/repositories/{moves,audience,marks,users,circles,moments}.py` | Repository Protocols and SQL adapters, following the existing repository-module convention |
| `app/repositories/unit_of_work.py` | Transaction Protocol and SQL session-backed implementation |
| `app/repositories/media.py` | Local media storage port and filesystem adapter |
| `app/core/composition.py` | Build core services and gateways from SQL adapters, clock, events and hooks |
| `app/core/gateways.py` | SQL-backed cross-lane gateway adapters, each opening its own short session |
| `app/services/{moves,audience,marks,users,circles,moments}.py` | Use-case orchestration against injected contracts |
| `app/api/deps_core.py`, `app/api/routes/*.py` | Request-scoped construction, HTTP transport and thin handlers |
| `app/api/routes/media.py` | Authorized Moment bytes plus allowlisted public seed Mark assets |
| `app/core/areas.py` | Demo-area definitions and pure coarse-location lookup |
| `app/seed/assets/`, `app/seed/media.py` | Bundled asset manifest and materialization of private seed media |
| `postman/collections/core-smoke/`, `postman/environments/core-local.yaml` | Local runnable API contract and live smoke checks |
| `backend/scripts/check_core_live.py` | Real-server startup/cleanup, Postman invocation and real WebSocket observations |

All `app/` paths above are under `backend/`. Extend the lane-isolation ownership
map to cover new core files; otherwise moving a file could accidentally remove
it from the guard. Keep foreign schemas and future lane modules outside this
core reorganization.

## Task 1: Pin the contract and correct the handoff documentation

**Files:** Modify `ARCHITECTURE.md`, `backend/ARCHITECTURE.md`,
`docs/BACKEND_TASKS.md`, `docs/CORE_BRANCH_REVIEW.md`, `backend/.env.example`.
Create `backend/tests/contract/test_core_api_contract.py` and
`backend/tests/contract/fixtures/core-openapi.json`.

**Interfaces:** Existing `MoveGateway`, `MarkGateway`, `UserGateway`,
`TimeControl`, `Hooks` and core HTTP operations are the compatibility baseline.
No runtime signature changes in this task.

- [ ] Capture normalized core OpenAPI operations, request/response properties, required fields, enums and status codes. Ignore generated component names and operation IDs when comparing semantic compatibility.
- [ ] Add `test_core_api_contract_preserves_shapes` against the captured fixture, scoped to implemented core endpoints and the existing health/notes routes. Do not describe absent foreign endpoints as implemented.
- [ ] Document the actual awaitable MoveGateway mutations and the additional existing gateway methods; show one awaited `create` and `add_participant` example. Update the owned-file map to include circles, audience routes and core dependencies.
- [ ] Clarify `POST /moves` takes `mark_id`, not a nested `mark` object; it maps a composer draft into the create payload. Specify the repeated multipart field `tagged_user_ids` and `DELETE /me/blocks/{user_id}`.
- [ ] Record the media decision, shared bootstrap change, pure-domain exception for shared vocabulary, and eventual models package. Describe the current branch and target state separately until each task lands.
- [ ] Correct `.env.example`: the clock works with DEMO_MODE now, but Demo Control routes and fake Muse execution require their owning lanes. Update the review with the later successful CLI 1.88.0 verification; retain the historical runtime evidence.
- [ ] Run `uv run pytest tests/contract/test_core_api_contract.py` from `backend/`. Expected: baseline passes before refactoring. Inspect the documentation diff for changes that would merely hide missing behavior.

**Deliverable:** A stable compatibility baseline and an explicit list of intended differences. Suggested commit: `docs: pin core API and architecture alignment decisions`.

## Task 2: Correct lifecycle ordering and refresh after creation hooks

**Files:** Modify `backend/app/main.py`, `backend/app/services/moves.py`,
`backend/tests/core/test_move_service.py`,
`backend/tests/contract/test_app_boot.py`. Leave `hooks.py` unchanged.

**Interfaces:** Keep `register(container, hooks, scheduler) -> None`,
`await hooks.on_move_created.fire(move_id)`, and
`await MoveService.create(creator_id, draft) -> MoveSnapshot`.

- [ ] Add `test_creation_orders_committed_sweep_notify_publish`: record a committed-row read from a fresh session, a sweep handler, a notify handler and a publisher. Assert that order exactly; let the sweep join another user through the gateway.
- [ ] Add `test_creation_refreshes_hook_mutations`: the returned snapshot includes that participant and final event recipients use current visibility. A block written by a hook must exclude the blocked viewer from the final publication.
- [ ] Add `test_creation_hook_failure_still_publishes_once`: first handler raises, second runs, row remains committed, and exactly one `move.created` is emitted. Add a rollback case proving no hook/event occurs if persistence fails.
- [ ] Set default lane registration order to Core → Surfaces → Muse. Verify registration itself does not execute handlers; all ports must be available before requests or scheduler jobs run. Retain caller-supplied lane sequences used for isolated boot checks.
- [ ] Give creation its explicit post-commit sequence. Do not reverse `_commit` ordering globally: join must still publish `participant.changed` before its second-order notification hook. End remains committed before its end hook.
- [ ] After creation hooks, refresh using the persistence boundary, then reload the Move and recalculate viewers before publishing. Do not return the pre-hook snapshot. Avoid retaining a read transaction across handlers that write through a different SQLite connection.
- [ ] Document that an autojoin's `participant.changed` can arrive before `move.created`; consumers must refetch/upsert by ID. Do not build an event buffering system or notification deduplication engine in core.
- [ ] Run `uv run pytest tests/core/test_move_service.py tests/contract/test_app_boot.py tests/contract/test_hooks.py`. Expected: ordering, null-lane startup, failure isolation and existing lifecycle checks pass.

**Deliverable:** Correct creation sequencing with a small, explicit shared-bootstrap diff. Suggested commit: `fix: order move creation hooks before publication`.

## Task 3: Extract HTTP schemas without changing payloads

**Files:** Replace `backend/app/models.py` with `backend/app/models/__init__.py`
and the model modules in the target map. Modify core route imports,
`backend/app/api/errors.py` only if imports require it, and
`backend/tests/core/test_privacy_suite.py`.

**Interfaces:** Preserve all existing schema properties, defaults and public
class names. Keep `from app.models import HealthResponse, NoteCreate, NoteRead`
valid. Name the two current Moment schemas `MomentRead` in `models/moments.py`
and `MarkMomentRead` in `models/marks.py` to avoid collisions.

- [ ] Move UserLite/common person schemas first, then users/circles/audience, then marks, moves and Moments. Preserve existing converters initially; storage-record cleanup follows in Tasks 4–6.
- [ ] Remove route-to-route imports used only for schemas. Service dependencies belong in `api/deps_core.py`; presentation helpers remain HTTP-layer code.
- [ ] During migration, re-export schema names from their old route modules where existing callers/tests import them. Remove only compatibility aliases proven unused by repository consumers.
- [ ] Extend the privacy schema scan to recurse through the models package and every registered response model. Assert that user schemas never contain coordinates and that moving a schema cannot evade the scan.
- [ ] Run `uv run pytest tests/contract/test_core_api_contract.py tests/core/test_moves_routes.py tests/core/test_users.py tests/core/test_marks.py tests/core/test_moments.py tests/core/test_privacy_suite.py`. Expected: identical wire shapes and no new schema leaks.

**Deliverable:** A clear schema boundary without HTTP contract churn. Suggested commit: `refactor: centralize core HTTP schemas`.

## Task 4: Inject Move repositories and make transaction ownership explicit

**Files:** Modify `app/services/moves.py`, `app/services/audience.py`,
`app/repositories/{moves,audience}.py`, `app/api/deps_core.py`,
`app/api/routes/moves.py`, `app/lanes/core.py` under `backend/`.
Create `app/repositories/unit_of_work.py`, `app/core/composition.py`,
`app/core/gateways.py`, `app/domain/people.py` and
`tests/core/test_transactions.py`. Update existing service/gateway tests.

**Interfaces:**

```python
class Transaction(Protocol):
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def refresh(self) -> None: ...  # finish read transaction, expire cached rows

class CoreUnitOfWork(Transaction, Protocol):
    moves: MoveRepository
    audience: AudienceRepository
    # users, circles, moments and marks are added in Tasks 5–6

MoveService(uow: CoreUnitOfWork, clock: Clock,
            events: EventPublisher, hooks: Hooks)
```

The existing `MoveRepository` operation signatures remain unchanged. Add
immutable `Person` records carrying the current User fields, including the
internal `last_area`; expose only the existing UserRead/UserLite subset through
schemas. AudienceRepository returns these records instead of ORM User rows.

- [ ] Implement `SqlCoreUnitOfWork(session)` so all repositories share one session. Repository writes flush only; the service transaction commits once. `refresh()` ends any post-commit read transaction and invalidates ORM identity-map state before reloading hook changes.
- [ ] Replace MoveService's Session and concrete repository construction with the injected unit of work. Obtain creator verification and presentation people through AudienceRepository records, not direct `session.get(User, ...)`.
- [ ] Move SqlMoveGateway into `core/gateways.py`; preserve its public port signatures and per-call session lifetime. Construct services in `core/composition.py`, used by request dependencies and gateways. Keep temporary old-name re-exports only if existing callers need them.
- [ ] Add failure injection at participant/audience insertion and commit. Assert that no partial Move/audience/creator survives, and that hooks/events do not fire on failed commit. Post-commit subscriber failure must not roll back the row.
- [ ] Preserve the SQL visibility filter for efficient list queries and pure `can_see` for individual decisions. Add a table-driven parity check for creator, participant, audience, blocked viewer and stranger; do not load every Move into Python to avoid having an SQL predicate.
- [ ] Run `uv run pytest tests/core/test_move_service.py tests/core/test_move_repository.py tests/core/test_privacy.py tests/core/test_transactions.py tests/core/test_moves_routes.py`. Expected: behavior unchanged except Task 2's intended ordering.

**Deliverable:** Move business orchestration no longer constructs SQL adapters or manipulates ORM sessions. Suggested commit: `refactor: inject move persistence and transaction boundary`.

## Task 5: Extract people and Circle persistence

**Files:** Create `backend/app/repositories/users.py` and `circles.py`;
modify `domain/people.py`, `services/{users,circles}.py`, composition,
dependencies, gateways, unit of work and `tests/core/test_users.py`.

**Interfaces:** `UserService(uow: CoreUnitOfWork, clock: Clock)` and
`CircleService(uow: CoreUnitOfWork)`. Preserve public method arguments and
HTTP return shapes. Add immutable Settings and Circle records whose fields
mirror existing settings and circle schemas; CircleView members are Person
records. SQL adapters alone translate rows into these records.

- [ ] Define UsersRepository for user lookup/list, settings get/put, owned-circle IDs, friendship/hangout reads, block list/add/remove, and autojoin list/replace/add. Move existing SQL queries unchanged into the adapter first; retain close-friend tier calculation in the service.
- [ ] Define CirclesRepository for owned list/get, create/update, member replacement and delete, plus owner default-setting cleanup. Keep name validation, owner authorization and user-existence validation in services.
- [ ] Preserve `require_users` behavior as a service helper backed by UsersRepository: deduplicate in caller order, reject missing users and forbidden self-selection before writing.
- [ ] Add `test_circle_replace_failure_preserves_members`, `test_circle_delete_preserves_posted_visibility`, and `test_autojoin_replace_failure_preserves_preferences`. Assert rollback leaves all old rows intact; deletion removes the default-circle reference while historical audience membership remains unchanged.
- [ ] Preserve existing deletion behavior for historical circle labels until a separate schema decision defines snapshots; do not introduce a new table or silently enable foreign-key enforcement globally in this refactor.
- [ ] Run `uv run pytest tests/core/test_users.py tests/core/test_privacy.py tests/core/test_privacy_suite.py tests/core/test_transactions.py`. Expected: defaults, ownership, settings validation and historical access remain intact.

**Deliverable:** People/Circle rules can be exercised without an SQL session. Suggested commit: `refactor: isolate users and circles persistence`.

## Task 6: Extract Moment persistence and finish core dependency boundaries

**Files:** Create `backend/app/repositories/{moments,media}.py`,
`backend/app/domain/{moments,marks}.py`,
`backend/tests/contract/test_core_layering.py`. Modify Moment/Mark services,
repositories, composition, gateways, unit of work, model converters and
`tests/core/{test_moments,test_marks,test_privacy_suite}.py`.

**Interfaces:**

```python
class MediaStore(Protocol):
    def write(self, filename: str, data: bytes) -> None: ...
    def remove(self, filename: str) -> None: ...
    def resolve(self, filename: str) -> Path | None: ...

MomentService(uow: CoreUnitOfWork, clock: Clock, events: EventPublisher,
              notifier: Notifier, media: MediaStore, *,
              media_url_prefix: str = '/media', max_bytes: int = MAX_UPLOAD_BYTES)
```

Keep existing upload, answer, list/get and media method arguments. Moment,
MomentTag and saved-item records copy the fields already used by current views;
use tuples for list-valued immutable snapshots. Do not expose SQLModel rows
through repository return values. Existing MarkRepository methods retain their
semantics while their ORM return types become these plain records.

- [ ] Extract Moment queries/writes and tag updates to MomentsRepository. Keep `moment_status`, `may_view`, tag validation and file-content validation as pure rules. Move SQL-backed MarkGateway into `core/gateways.py`.
- [ ] Keep file cleanup transactional in the existing sense: validate before writing, remove a newly written file if DB commit fails, emit events/notifications only after commit. Do not add a background orphan collector or object-storage dependency.
- [ ] Add `test_failed_moment_commit_removes_file`, `test_media_write_failure_creates_no_row`, and retain multiple-tag approval/withdrawal tests. Assert approval cannot widen the underlying Move audience.
- [ ] Add static checks: services import repository contracts but never SQLModel/SQLAlchemy/tables or Sql adapter names; domains never import outer layers; routes never construct SQL adapters. Update lane-isolation coverage for every newly created file.
- [ ] Run `uv run pytest tests/core/test_moments.py tests/core/test_marks.py tests/core/test_privacy_suite.py tests/contract/test_core_layering.py tests/contract/test_lane_isolation.py`. Expected: uploads, consent, scores/saves and isolation pass.

**Deliverable:** Core services depend on pure records and injected contracts. Suggested commit: `refactor: isolate moment storage and enforce core layering`.

## Task 7: Serve canonical authorized media and bundle the seed world

**Files:** Create `backend/app/api/routes/media.py`, `backend/app/seed/media.py`,
`backend/app/seed/assets/manifest.json`, `backend/app/seed/assets/README.md`,
and bundled PNG/JPEG files for Mark categories and seeded Moments.
Modify `app/main.py`, `app/api/routes/moments.py`, `app/seed/core.py`,
`app/core/config.py` if needed for asset configuration, package configuration,
`tests/core/{test_moments,test_seed_core,test_privacy_suite}.py` and docs.

**Interfaces:** `GET /media/{filename}` is the canonical authenticated Moment
route. Keep the old `/api/v1/media/{filename}` handler as an alias applying the
same policy. `GET /media/seed/marks/{asset_name}` serves only a manifest-listed
public Mark asset. Private seed Moments use `{moment_id}.jpg` or `.png` in
MEDIA_DIR, exactly as uploads do.

- [ ] Add `test_both_media_routes_enforce_identical_consent`: pending audience and blocked viewers receive 404 from both paths; no header receives 401; approved audience gets identical bytes.
- [ ] Generate new Moment URLs with the root path. Resolve old stored `/api/v1/media/...` URLs without rewriting the DB: validate both known prefixes for the same filename. Return `Cache-Control: private, no-store` for protected media, so future fetches recheck consent.
- [ ] Register the canonical media router outside the API prefix; keep ordinary JSON routes under `/api/v1`. Never add a public catch-all StaticFiles mount over MEDIA_DIR.
- [ ] Bundle a small set of project-owned or clearly licensed images, with attribution/provenance in the asset README. Reuse category images for Marks if necessary; provide actual viewable demo imagery rather than empty files or one-pixel fixtures. Use the image-generation skill if creating new raster images.
- [ ] Load packaged assets through `importlib.resources`; materialize seed Moment files from the manifest before committing their rows. Preserve IDs, tags/status, count and clock-relative timestamps. Reset only seed-owned files; do not delete arbitrary uploads.
- [ ] Replace Picsum Mark and Moment URLs with the local routes. Keep empty avatar URLs plus initials/colors, already supported by the client contract.
- [ ] Add `test_seed_assets_available_from_installed_package`, `test_seed_media_is_offline_and_authorized`, and `test_reseed_keeps_unrelated_uploads`. Verify every manifest entry exists and every seeded media URL resolves with the correct permissions.
- [ ] Run `uv run pytest tests/core/test_seed_core.py tests/core/test_moments.py tests/core/test_privacy_suite.py tests/contract/test_core_api_contract.py` and `uv build`. Install the wheel in an isolated environment and verify assets are present; inspect Docker packaging if assets are excluded.

**Deliverable:** The documented root media path works without weakening approval, and seed images no longer depend on external servers. Suggested commit: `fix: serve authorized local seed and upload media`.

## Task 8: Implement the specified coarse area label with consent

**Files:** Create `backend/app/core/areas.py`; modify
`app/services/users.py`, `app/repositories/users.py`,
`app/api/routes/{moves,marks}.py`, dependencies and
`tests/core/{test_users,test_privacy_suite}.py`. Update section 12.1.

**Interfaces:**

```python
def coarse_area(lat: float, lng: float) -> str | None: ...
def UserService.record_near_area(self, user_id: str, lat: float, lng: float) -> None: ...
```

- [ ] Define the single supported demo region as the bounding envelope of seed Mark coordinates, labeled `UT Dallas`, using shared area configuration rather than importing the seed runner into request handling. Round input to three decimals first. Outside that region, the label is None; never label an arbitrary worldwide query UT Dallas.
- [ ] Record only the label when `location_opt_in` is true. Both nearby endpoints use the same rounding/recording helper. Search remains available without coordinates or opt-in. An opt-out clears `last_area`; denied-permission queries never create a location record.
- [ ] Add `test_near_area_requires_consent`, `test_near_area_stores_only_label`, `test_unknown_region_does_not_store_false_area`, and `test_opt_out_clears_last_area`. Assert no coordinates enter user schemas, table rows, or emitted events.
- [ ] Update the existing “nearby does not mutate users” check to distinguish forbidden coordinate storage from the explicitly permitted opted-in label update. Keep the no-user-coordinates checks unchanged.
- [ ] Review request logging: normal server access logs should omit/redact nearby query strings so precise caller-supplied values are not retained before rounding. Do not add location analytics or logging of request bodies.
- [ ] Run `uv run pytest tests/core/test_users.py tests/core/test_moves_routes.py tests/core/test_marks.py tests/core/test_privacy_suite.py`. Expected: opt-in/opt-out, boundary and no-leak behavior pass.

**Deliverable:** The existing last_area column fulfills its documented purpose without adding a new tracking surface. Suggested commit: `fix: honor consent for coarse nearby area labels`.

## Task 9: Repeatable live backend verification and final audit

**Files:** Create local Postman collection/environment at the paths in the
target map; create `backend/scripts/check_core_live.py` and
`docs/CORE_RUNTIME_VERIFICATION.md`. Update the review with final outcomes.

**Interfaces:** `python scripts/check_core_live.py --port 8765` owns a fresh
temporary DB/uploads directory and its server process. It prints the paths to
reports, refuses an already occupied port, and cleans up its own server on
success or failure. It must never import test fixtures or use TestClient.

- [ ] Build a local Postman v3 collection using the installed CLI/schema skill at execution time. Environment contains only `base_url` and seeded demo IDs. Store dynamically created IDs as collection variables; keep cloud reporting disabled and do not require login or workspace publication.
- [ ] Exercise health, invalid auth, picker, settings, Circle ownership/edit/delete, preview, Marks/save/unsave, Move creation/join/arrive/leave/end and everyone-left expiry. Assert domain outcomes and exact privacy failures, not merely 2xx responses.
- [ ] Exercise multipart upload, multiple-tag approval, withdrawal, blocked-user access, both media URLs and seed photos. Verify root private media cannot be fetched anonymously and public Mark assets cannot be used to fetch private files or traverse directories.
- [ ] Use actual WebSocket clients alongside Postman requests for creation/participant/end/Moment events, multiple sockets, hidden-user exclusion and reconnect/refetch. Keep each wait bounded; report the failed expectation clearly.
- [ ] Backdate one Move and participant row in the isolated DB and observe the real scheduler within 65 seconds. Also backdate a Move with recent participant activity and confirm it remains live. Do not add a production “test clock” endpoint.
- [ ] Verify persistence with a server restart against the same isolated database. Verify seed imagery with external network access unavailable. Foreign ports remain the normal null implementations; state that Muse failure simulation and full lane integration are separate evidence.
- [ ] Handle Postman negative checks correctly: CLI 1.88.0 returned exit 1 for an expected HTTP 404 even when its assertion passed. Parse the structured report and require all expected assertions to pass; never ignore all nonzero statuses or convert transport failures into successes.
- [ ] Run `uv run pytest tests/core tests/contract`, `uv run pytest tests/test_main.py tests/test_notes.py`, `uv run ruff check .`, then the real-server script. Run the baseline suite once before implementation as well, so pre-existing failures are identified.
- [ ] Confirm `git diff --check`, inspect the semantic OpenAPI diff and list all intentional changes. Update the review finding-by-finding with resolved status or an explicit remaining dependency. Run `postman status` and record version, local initialization and auth requirements without treating login as a prerequisite for local requests.

**Deliverable:** A reproducible core-backend acceptance run and honest final scope statement. Suggested commit: `test: verify core architecture against a running server`.

## Execution order and completion gates

Execute 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 in this session. Each task is a
separate reviewable change; the suggested commit messages describe boundaries,
not a requirement to commit or publish without the user's normal workflow.
Re-run the affected checks per task; run the broader suite at the final gate,
or earlier when a failure indicates broader impact.

| Gate | Required evidence |
| --- | --- |
| Contract aligned | Async docs match ports, media exception documented, all core tasks mapped |
| Behavior aligned | Creation sequencing and refreshed responses pass; other lifecycle semantics preserved |
| Boundaries aligned | Static layering/lane checks pass; no service SQL/session dependencies |
| Seed/media aligned | Installed assets load offline; consent enforced for both URLs and seed Moments |
| Runtime aligned | Real HTTP, WebSockets, scheduler and restart checks pass against isolated SQLite |

Do not claim full-product E2E completion at this gate. That requires actual
Muse/Notifier, Surfaces hooks and endpoints, and the frontend/phone interactions.
For Z1, carry forward an explicit integration checklist: proximity before notify,
no duplicate nudge during nested autojoin hooks, creator-edited notify exclusions,
hangout/rating creation on end, and client recovery from an event arriving before
the HTTP create response.

## Self-review and known limits

- All six findings in the core review map to tasks above. T0/C1–C11 are covered by compatibility checks, refactors or the live gate; unchanged rules are preserved rather than reimplemented.
- Root architecture sections 8–11 and 13 primarily belong to other lanes. Core exposes their ports/hooks but does not implement their behavior here.
- Shared port signatures, SQL schemas and seed IDs remain stable. Shared bootstrap edits are explicit and bounded. No database migration framework is introduced.
- Literal file-layout parity is intentionally relaxed for split tables, modular schemas and shared pure vocabulary. The result preserves the architecture's inward dependencies without undoing the lane contract.
- A public private-media mount is intentionally rejected in favor of the stronger approval rule. Updating documentation alone is insufficient: Task 7 also supplies the root URL and local assets.
- `last_area` region bounds are a demo-specific interpretation, documented in Task 8; multiple geographic areas would need a separate product/data decision.
- Durable event delivery, multi-worker WebSocket fanout, real authentication, external image hosting, production deployment and new user-facing features are outside this refactor.
