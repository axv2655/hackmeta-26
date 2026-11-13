# PROMPTS.md: Surfaces lane (`lane:surfaces`) implementation prompts

Scope: **only the 11 surfaces issues, S1 to S11 (#24 to #34).** T0 (#1), core, muse and Z1 appear only as dependencies or as
"asks" for their owners. All work is backend. Sources: live issue bodies (read with `gh`, authoritative), `docs/BACKEND_TASKS.md` on
`origin/main` **and** the unmerged `origin/docs/backend-task-fixes` branch, and `ARCHITECTURE.md` (7.3, 8, 10.6, 11.1, 11.4, 12, 13, 15).
Findings from `REVIEW.md` are all dispositioned in the table at the end.

Deadline: **Friday 10:30 a.m.** live demo. Freeze features after M4.

## Status of T0 (#1), verified 2026-11-12

`origin/main` has none of `ports.py`, `ports_null.py`, `hooks.py`, `container.py`, `tables/`, `lanes/surfaces.py`, `scheduler/loop.py`,
`seed/ids.py`, `tests/conftest.py`, `tests/contract/`. No PRs are open (`gh pr list`). One branch (`claude/charming-bardeen-81bu0n`) has a
partial `lanes/` scaffold. Re-check with `git fetch && gh pr list` before assigning work; do not treat this paragraph as current after today.

**What this blocks.** Anything that imports a port, a table, a hook, `container`, `lanes/surfaces.py` or the test fixtures cannot be written
*correctly* until the T0 merge commit exists. Pure functions that import only the standard library can be written and unit-tested now (see
"Start now vs blocked"). Do not branch gateway-dependent work from `main`; branch from the T0 merge commit and run its null-port boot,
route-registration and lane-isolation tests first.

**What T0 merge does not give you.** M0/M2 are *backend handoffs*. A live S10 control still needs core C1/C4 and Muse implementations behind the
ports; the seed world still needs core C10. Passing surfaces' isolated tests satisfies no two-phone demo step: the frontend is still the Hello-world
`App.js` with no router. A demo step counts as done only after Z1 integration plus a frontend device check.

## Priority order (P0 first, then milestone)

| Order | Task | Issue | Pri | Milestone | Depends on | Why here |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **S11** Seed surfaces | #34 | **P0** | M0 | T0 (+ C10 for a full world) | Demo data for S4/S6/S7 (and S5 if built). |
| 2 | **S10** Demo Control routes | #33 | **P0** | M2 | T0 (+ C1/C4/Muse to be live) | Every timed or hardware demo step needs a trigger. |
| 3 | **S6** Pairwise ranking + ratings | #29 | P1 | M3 | T0 | Demo step 6. Unblocks S7. |
| 4 | **S8** Move-ended handler | #31 | P1 | M3 | T0 | Demo step 6 (rating prompt after End). Feeds Muse revive. |
| 5 | **S7** Leaderboards | #30 | P1 | M3 | T0, S6 | Demo step 6. |
| 6 | **S1** Proximity ingest | #24 | P1 | M4 | T0 | Also owns `/demo/copresence`. Unblocks S2, S3. |
| 7 | **S4** Reels | #27 | P1 | M4 | T0 | Demo step 2. |
| 8 | **S2** Proximity sweep | #25 | P1 | M4 | T0, S1 | Demo step 4. |
| 9 | **S3** Open Moves | #26 | P2 | M5 | T0, S1 | Stretch. |
| 10 | **S9** Glasses + `/mcp` connector | #32 | P2 | M5 | T0 | Stretch. Demo step 9: "Hey Meta" through the connector, voice screen as backup. |
| 11 | **S5** Calendar | #28 | P2, deferred | M5 | T0 | No consumer after the flare cut (see S5). Build only if time is left. |

## Start now vs blocked on T0

**Start now (no T0 needed): pure, stdlib-only functions plus their unit tests.** Branch from `main`, rebase onto the T0 merge commit later. Put
only the pure part in the owned file; leave ports, tables, routes and registration for after T0.

| Task | Safe to build now | Still blocked on T0 |
| --- | --- | --- |
| S6 | `domain/ranking.py`: `next_comparison`, `apply`, `Face`, `Comparison`, band constants, all ranking unit tests | `services/ratings.py`, routes, `ratings`/`mark_rankings` tables, `on_rating_submitted` |
| S1 | Pure cluster math (connected components), token-expiry and 60 s / -75 dBm / 2 h rules as functions | Ingest, tokens, `copresence` / `proximity_sightings` tables, routes, listener wiring |
| S8 | Pair generation, hour/weekday bucketing, overlap computation as pure functions | Handler, `hangouts` table, `MoveGateway`, `Notifier`, `EventPublisher`, hook registration |
| S7 | Score aggregation (friends-only average, "your / friends'" shape, stable ties) as pure functions | Service, routes, `mark_rankings`, friendships table |
| S11 | Pure date-relative pattern generator (walk back whole weeks, Thursday/weekday logic) | Inserts into any table, `seed/ids.py`, `seed.py` runner |
| (any) | Contract asks below (comment on #1 before it freezes) | n/a |

**Blocked on T0, do not start:** S10, S4, S2, S3, S9 (every one is mostly port wiring), and the non-pure parts of S1/S6/S7/S8/S11 in the right column.

## Ground rules (from every issue; do not break)

1. Edit **only** the files under "You own" plus your lane's shared files: `backend/app/lanes/surfaces.py`, `backend/app/models/surfaces.py`,
   `backend/tests/surfaces/fakes.py`, `backend/tests/surfaces/factories.py`. Keep shared-file edits small and append-only.
2. Never touch other lanes' files, `ports.py`, `hooks.py`, `tables/`, `models/shared.py`, `api/deps.py`, `api/main.py`.
3. Write only surfaces tables: `proximity_sightings`, `copresence`, `hangouts`, `ratings`, `mark_rankings`, `calendar_events`, `reels`, `saved_reels`.
   Reading any table is fine. Cross-lane behaviour goes through ports only (the sole exception is S11's history inserts).
4. Tests live in `backend/tests/surfaces/`. Fresh in-memory SQLite per test, data from `factories.py`, foreign ports faked in `fakes.py`. No seed,
   test order, real Muse, wall clock, or other lane's code. Use the injected `Clock`.
5. **Fakes must match the frozen `ports.py` signatures exactly.** Never write a fake method the real port lacks ("assume the issue text and fake it" is
   not allowed). If a needed method is missing, stop and raise it on #1 before it freezes.
6. Done = `cd backend && uv run pytest tests/surfaces tests/contract && uv run ruff check . && uv run ruff format --check .` pass, and the feature
   works with all other lanes on null ports and with Muse unavailable.
7. Branch `surfaces/<task-id>-short-name`; one PR per issue; PR body `Closes #<issue>`.
8. Product rules (ARCHITECTURE.md 1.5): no user coordinates in any response; no "who is near me" list; visibility only via `MoveGateway`
   (`can_see`); Muse proposes and the user taps; no `datetime.now()`, use `Clock`.
9. Layering (`backend/ARCHITECTURE.md`): pure rules in `domain/`, use cases in `services/`, thin handlers in `api/routes/`. Immutable data.

## Contract status (what T0 must contain before you branch)

The proposal on `origin/main` lacks several items the issues use. **`origin/docs/backend-task-fixes` adds most of them but is not merged.** Merge it
(or fold it into T0) before T0 freezes.

| Item | Needed by | State |
| --- | --- | --- |
| `Clock.set_time` / `Clock.shift` | S10 | Added on fixes branch |
| `MoveGateway.add_open_audience`, `set_autojoin` | S3, S2 | Added on fixes branch |
| `MuseGateway.notify_preview` | S4, S9, S10 | Added on fixes branch. (`run_free_time_scan` is removed with the flare cut.) |
| `on_move_created(move_id, notify_user_ids)` | S2 | Added on fixes branch (main still says `(move_id)`) |
| `app/seed/seed.py`, `app/models/__init__.py`, `proximity_prompt` route stub owned by T0 | S1, S2, S11 | Added on fixes branch |
| `app/main.py` (lifespan registers the three lanes) listed as T0-owned | all | **Open.** T0 build requires it; owned-files list omits it |
| Reset boundary for S10 (see S10) | S10 | **Open** |
| Participant arrive/leave timestamps on `MoveSnapshot`/`ParticipantSnapshot` | S8 | **Open** |
| `reels.resolved_mark_id`; `saved_reels(user_id, reel_id, created_at)` columns | S4 | **Open** |
| Text lookup for Marks (e.g. `MarkGateway.search(q, limit)`) | S4 caption fallback | **Open** |
| Per-user "rating prompt sent" marker (surfaces-owned) | S8 idempotency | **Open** |
| Beacon route module for open Moves (see S3) | S3 | **Open** |

---

## S11. Seed surfaces (#34) · P0 · M0 (backend handoff)

**Goal.** Deterministic demo data for the surfaces tables, generated relative to the `Clock` so patterns stay "recent" on demo day.

**Files.** `backend/app/seed/surfaces.py`, `backend/app/seed/history.py`, `backend/tests/surfaces/test_seed_surfaces.py`. Uses IDs from `seed/ids.py`.
Do not edit `seed/seed.py` (T0).

**Build.**
- `history.py` may INSERT ended `moves` and `move_participants` directly, without firing hooks (the one seed-only exception). Nothing else in surfaces
  writes core tables.
- 8 weeks of history: Anish + Priya (+ Tony) matcha/coffee weekday afternoons (4 matcha spots last month); Anish + Tony + Maya lunch; Anish + Maya + Dev
  climbing Thursdays that **stopped 4 weeks ago**; HS friends one hangout 6 weeks ago.
- `surfaces.py`: `hangouts` from that history; `ratings` and `mark_rankings`; 4 Reels (Kumo geotag, nobody-there Mark, caption-only, one more); Anish's
  mock calendar (a few classes; only the notify picker's busy/free signal reads it); Anish's saved Kumo Reel from 3 days ago as a `saved_reels` row. Core's C10 (#11) seeds the
  matching `saved_marks` row (`source=reel`, `source_ref` = the Kumo Reel id): **this is already in C10's build list**, S11 must use the same
  `kumo_reel` id from `seed/ids.py` and the same resolved Mark.

**Acceptance.**
1. Re-seeding at a shifted Clock shifts every timestamp; patterns remain "recent".
2. Counts, weekdays and the fading-group gap match the patterns above.
3. The Reel set covers friends-there, nobody-there and caption-only.
4. `S11`'s own tests use only its own factories; they do not import the core seed.
5. **Handoff check (run in Z1, listed in the asks):** with both seeds run, Anish's `saved_reels` row and `saved_marks` row point at the same Mark, and
   the Kumo Reel is a plain Saved Mark (nothing flares from it).

**Edge cases.** Clock on a weekend or Thursday (walk back whole weeks, not "N days"). Midnight/DST boundaries. Re-running one module (no duplicate
inserts). Missing `ids.py` entry (clear error). History rows satisfy core constraints (`ends_at` after `starts_at`).

**Test.** Seed into a fresh in-memory DB with a fake Clock; assert per-pair counts, weekday sets, last climbing hangout >= 4 weeks old, HS hangout about
6 weeks old, saved Reel 3 days old. Re-run with a shifted Clock and assert identical relative offsets.

---

## S10. Demo Control routes (#33) · P0 · M2 (backend handoff)

**Goal.** `/demo/*` triggers that fire the **same gateway code paths as production**, only when `DEMO_MODE` is set.

**Files.** `backend/app/api/routes/demo.py`, `backend/app/services/demo.py`, `backend/tests/surfaces/test_demo.py`.

**Build.** Routes: `reset`, `time`, `revive-scan`, `friend-move`, `friend-join`, `end-move`, `nobody-bit`, `route`, `muse-stats`.
**`/demo/copresence` is S1's** (as stated in #33 itself); do not build it here, and make sure S1's route uses the same `DEMO_MODE` gate.

| Route | Calls |
| --- | --- |
| `time` | `Clock.set_time` / `Clock.shift` |
| `reset` | the injected **`reset` callable** (below), then `Clock.set_time(None)` |
| `revive-scan` / `nobody-bit` / `route` | `MuseGateway.run_revive_scan` / `run_nobody_bit` / `run_route` |
| `friend-move` | `MoveGateway.create` |
| `friend-join` | `MoveGateway.add_participant(move_id, user_id, 'going', 'tap')` |
| `end-move` | `MoveGateway.end` |
| `muse-stats` | `MuseGateway.muse_stats` |

**Reset boundary.** S10 must not import the multi-lane seed runner directly (it would break "cross-lane only through ports"). It takes an injected
`reset: Callable[[], ResetResult]` resolved from `container`. T0 must expose that slot (null default: no-op returning `{"reset": false, "reason": "no seed runner"}`).
If T0 does not provide it, stop and raise it on #1.

**Acceptance.**
1. `DEMO_MODE` unset: every `/demo/*` route (including S1's `/demo/copresence`) returns 404.
2. With **null gateways** each route returns HTTP 200 with a documented body, never 500:
   `time` -> `{"ok": true, "now": <iso>}`; scan/route routes -> `{"suggestion": null}`; `friend-move` / `friend-join` / `end-move` -> `{"ok": false, "reason": "unavailable"}`;
   `muse-stats` -> `{}`; `reset` -> the null body above. Test each.
3. Each route dispatches to the right port with the right arguments (recording fakes).
4. `reset` is serialized by a lock (a concurrent second call waits or returns 409, never interleaves), always finishes with `Clock.set_time(None)`, and
   publishes a refetch hint to connected users through `EventPublisher` so clients refetch instead of crashing.
5. `time` requires exactly one of `iso` or `offset_minutes` (else 422); negative offsets work.
6. Unknown `user_id` / `move_id` returns the gateway's error as 404/422, not 500.

**Edge cases.** Reset while sockets are open. Double reset. Scan returning `None`. `friend-join` on an ended Move (gateway error surfaces cleanly).
Handlers stay thin; logic in `services/demo.py`.

**Test.** Recording fakes for `MoveGateway`, `MuseGateway`, `Clock`, `EventPublisher` and a fake `reset`; parametrized dispatch test over all routes; null-gateway
test asserting each body in criterion 2; gating test; reset-lock test (two concurrent calls); Clock-reset-after-reset test. A two-client replay of the
demo script belongs in Z1.

---

## S6. Pairwise ranking domain and rating service (#29) · P1 · M3

**Goal.** Beli-style rating: three faces plus pairwise answers produce an ordered list and 0 to 10 scores. The team's algorithm drops in later behind the same interface.

**Files.** `backend/app/domain/ranking.py`, `backend/app/services/ratings.py`, `backend/app/api/routes/ratings.py`, `backend/tests/surfaces/test_ranking_ratings.py`.

**Build.**
- `domain/ranking.py` (pure; **can start now**): `next_comparison(ranked, new_mark, answers) -> str | None` and
  `apply(ranked, new_mark, face, answers) -> list[tuple[str, float]]` per ARCHITECTURE.md 13.1. Placeholder: binary insertion; scores evenly spaced within a
  face band. Bands (documented constants, non-overlapping, so cross-face order is consistent with list order): Loved 7.0 to 10.0, Fine 4.0 to 6.9,
  Not for us 0.0 to 3.9.
- `GET /moves/{id}/rating/questions`, `POST /moves/{id}/rating`: update `ratings` and `mark_rankings`; fire `on_rating_submitted(move_id, user_id)`.

**Acceptance.**
1. Ordering is stable; scores strictly decrease down the list; all scores are within `[0, 10]`.
2. Only a participant who was `there` can rate (403 otherwise); a Move that has not ended is rejected (409).
3. Re-submitting replaces the user's rating for that Move (no duplicate rows), re-runs `apply`, and fires `on_rating_submitted` **exactly once per accepted
   submission** (assert call count).
4. A pairwise answer referencing a Mark not in the user's ranked list is a 422 and changes nothing.
5. Skipped steps are accepted: face only, or nothing, produce a defined result (documented in a test).
6. Concurrent submits for the same user+move are idempotent.

**Edge cases.** Empty ranked list (no questions; new Mark gets the band's default). Ties. Move with no Mark. Face band boundaries. Hook subscriber
failure must not roll back the stored rating.

**Test.** Pure unit tests: insertion at top / middle / bottom, ties, empty list, strict decrease, band boundaries, stability under repeated `apply`.
Service tests with fakes for criteria 2 to 6. One HTTP round trip.

---

## S8. Move-ended handler: hangouts and rating prompt (#31) · P1 · M3

**Goal.** When a Move ends, record who actually hung out and prompt them to rate.

**Files.** `backend/app/services/hangouts.py`, `backend/tests/surfaces/test_hangouts.py`. Registered on `on_move_ended` in `lanes/surfaces.py`.

**Build.** One `hangouts` row per **pair** that was `there` at overlapping times (weekday, hour bucket, category); send `rate_move` via `Notifier` and
`rating.prompt` via `EventPublisher`.

**Decisions (fixed, test them):**
- **Overlap** = the two participants' `there` intervals intersect for any positive duration. This needs arrive/leave timestamps on the snapshot (open
  contract item). If T0 provides only a final status, a pair counts when both ended as `there`; document that fallback in the test.
- **Who is prompted:** only users who were `there` at any time (not `going`-only). One attendee alone still gets the prompt but no hangout.
- **Idempotency:** `hangouts` rows are upserted on `(move_id, user_a, user_b)` with `user_a < user_b`. Write and commit hangouts first, then notify per
  user, catching each user's notifier/publisher error independently so one failure cannot block the rest or the hangout rows. Hooks fire once per end;
  a re-run recomputes the same hangouts (no duplicates). **At-most-once notification across a crash needs a "prompt sent" marker**: raise it on #1 as a
  surfaces-owned column or table (e.g. `rating_prompts(move_id, user_id, sent_at)`); until it exists, a re-run may re-notify, and the test must show
  hangouts stay unique.

**Acceptance.**
1. Pairs that never overlapped as `there` produce no hangout.
2. n=2, 3, 4 attendees yield 1, 3, 6 hangouts.
3. Hour buckets and weekday come from the Move's time via the Clock-derived value, correct at midnight rollover.
4. `rate_move` and `rating.prompt` go to each eligible user exactly once per hook fire; a notifier failure for one user does not stop others or remove hangouts.
5. Re-running the handler adds no duplicate hangouts.

**Edge cases.** Move with no category. Large groups (cap pair generation). `going`-only participants. Hook fired for an already processed Move.

**Test.** Fakes for `MoveGateway`, `Notifier`, `EventPublisher`. Pair counts, overlap vs non-overlap, buckets, per-user failure isolation, re-run idempotency.

---

## S7. Leaderboards (#30) · P1 · M3

**Goal.** Two boards computed on read from `mark_rankings`: Top spots (friends' average) and Your list.

**Files.** `backend/app/services/leaderboards.py`, `backend/app/api/routes/leaderboards.py`, `backend/tests/surfaces/test_leaderboards.py`.

**Build.** `GET /leaderboards/spots?category`, `GET /leaderboards/my-list?category`. Friends only; category filter; rows show "your score / friends' score".
No leaderboard tables.

**Acceptance (all required tests).**
1. Non-friends never influence any score.
2. A blocked friend (either direction) is excluded.
3. Your-list order equals your `mark_rankings` order.
4. Empty rankings or no friends return `[]` (200), not an error.
5. A Mark ranked only by you shows friends' score `null`; ranked only by friends shows your score `null`.
6. Ties break deterministically (score desc, then Mark id) and the order is stable across calls.
7. Unknown category returns 422; absent category means all categories.
8. **Flow test (fakes + fake Clock):** Move ends -> rating prompt (S8) -> rate (S6) -> leaderboard reflects the new score.

**Edge cases.** Rounding to one decimal. Large lists (limit param, default cap). Friendship status as defined by core's table.

**Test.** Factories for friendships, blocks, rankings; the eight cases above.

---

## S1. Proximity: tokens, sightings ingest, copresence, ProximityGateway (#24) · P1 · M4

**Goal.** Server side of BLE co-presence: tokens, sighting ingest, `copresence`, clusters, plus the simulated path.

**Files.** `backend/app/services/proximity.py`, `backend/app/api/routes/proximity.py`, `backend/tests/surfaces/test_proximity_ingest.py`. Scheduler purge in `lanes/surfaces.py`.

**Build.**
- `POST /proximity/token`: random, 15 min, mapped server-side to the user.
- `POST /proximity/sightings` (batch): resolve tokens; keep RSSI >= -75 dBm; upsert `copresence` only for friends (strangers only for open Moves, S3);
  co-present = seen within 60 s.
- Purge sightings older than 2 h via a scheduler job.
- `add_copresence_listener(fn)`: called with the changed pairs after any ingest that changes `copresence` (S2 subscribes).
- `inject_sim(user_ids, on)`: writes/clears `source: sim` sightings for every pair and runs the **same ingest path**. `POST /demo/copresence {user_ids, on}`
  lives in `routes/proximity.py`, 404 unless `DEMO_MODE`.
- Implement `ProximityGateway.copresent_cluster` and `open_moves_near`.

**Opt-in rules (fixed):** the **observer** must have `ble_opt_in` true or the batch gets 403 and writes nothing. A token resolves only while its **owner**
still has `ble_opt_in` true: revoking opt-in invalidates that owner's outstanding tokens, so a stale token cannot recreate co-presence. Opt-in is read from
`user_settings` (readable table).

**Acceptance.**
1. No response contains coordinates or a list of nearby users; raw sightings older than 2 h are purged.
2. Expired or unknown tokens are ignored with the same response (no leak of which).
3. **Revocation test:** token issued, owner revokes opt-in, sighting of that token produces no co-presence.
4. **Replay test:** the same batch twice leaves identical state and notifies listeners once.
5. **60 s boundary:** co-present at 60 s, not at 61 s; purge boundary at exactly 2 h.
6. Friends only; blocked users are dropped; a user sighting themselves is ignored.
7. `inject_sim` produces co-presence, calls listeners, and `on=false` clears pairs and notifies of the change.
8. `/demo/copresence` is 404 without `DEMO_MODE`.

**Edge cases.** Empty batch. Out-of-order timestamps. A raising listener is logged and swallowed; others still run. Cluster of one returns just the user.
All times via `Clock`.

**Test.** Token expiry, RSSI filter, friends-only, cluster math (chains of 3, disjoint groups), purge with fake Clock, the criteria above.

---

## S5. Calendar: mock events and busy blocks, no free-window consumer (#28) · P2 (deferred) · M5

**Does S5 still have a consumer? No.** Its only consumer was M7's flare agent (`CalendarGateway.free_window`). Flares and `free_time` are removed, so the
gateway, `FreeWindow` and the pure `free_window` function are dropped; there is no pure function left to "start now". The notify picker's busy/free signal
reads the `calendar_events` table directly (seeded by S11), not S5. **Defer S5**; build it only after M4 is demo-solid. If cut, also drop the two routes
from ARCHITECTURE.md 14.2, `lib/calendar.ts` and the Calendar onboarding opt-in.

**Files.** `backend/app/services/calendar.py`, `backend/app/api/routes/calendar.py`, `backend/tests/surfaces/test_calendar.py`.

**Build (only if built).** `GET /calendar` (reports `source: device|mock`); `PUT /calendar/busy` (start/end only).

**Acceptance.**
1. `PUT /calendar/busy` replaces the user's previous device blocks (no unbounded append), rejects `end <= start` with 422, and **never persists a `title`
   or any extra field** (assert on the stored row).
2. A user with no device blocks falls back to mock events and `GET /calendar` says so.

**Edge cases.** All-day events. Unknown user. Timezone: store UTC.

**Test.** Service test for title-dropping and replacement; one HTTP round trip.

---

## S4. Reels: list, place chip, save to Saved Mark (#27) · P1 · M4

**Goal.** Backend for Reels: list, one-time place resolution, chip/sheet data (friends there vs nobody there with a Muse draft), and saving to Saved Marks.

**Files.** `backend/app/services/reels.py`, `backend/app/api/routes/reels.py`, `backend/tests/surfaces/test_reels.py`.

**Build.**
- `GET /reels`; `GET /reels/{id}/place` -> mark, distance, active friend-Move summary, draft with Muse's list from `MuseGateway.notify_preview`. Resolve
  with `MuseGateway.resolve_place` once per Reel, cache `resolved_mark_id`.
- `POST /reels/{id}/save` inserts a `saved_reels` row and calls `MarkGateway.save(user_id, resolved_mark_id, 'reel', reel_id)`.
  `DELETE /reels/{id}/save` removes the `saved_reels` row only; per #27 the Saved Mark remains and is unsaved from the Mark (core's route).
  **Consequence to build for:** `GET /reels` returns `saved` computed from `saved_reels` (so the Reel reads "unsaved" after DELETE) and the response
  never claims the bookmark was removed. If the team wants DELETE to also unsave the Mark, that needs a new `MarkGateway` method: ask on #1, do not
  improvise.
- Fallback with Muse down: geotag, then (if coarse location is available) nearest Mark, then a **Mark text lookup by caption**. The text lookup port is an
  open contract item (e.g. `MarkGateway.search(q, limit)`). Until it exists, a caption-only Reel with no location and no Muse is `unresolved`.

**Acceptance.**
1. Active-Move summary only includes Moves in `MoveGateway.list_live_visible(viewer)`; a hidden Move never appears.
2. Friends-there and nobody-there paths both work; `draft` only when no active Move.
3. Resolver is called once per Reel; later calls reuse `resolved_mark_id` (assert call count).
4. Save writes `saved_reels` and calls `MarkGateway.save('reel', reel_id)`; DELETE removes only `saved_reels` and does not call any Mark unsave; both
   states are asserted (`saved_reels` row gone, `MarkGateway.save` called once earlier and not undone).
5. Saving an `unresolved` Reel returns 409 with a friendly message and creates nothing.
6. **Caption-only Reel with no location and Muse unavailable** returns an `unresolved` chip state (no crash, `mark: null`), once the text-lookup port is
   defined it resolves instead; the test covers whichever the frozen contract allows.
7. Save twice is idempotent; location denied gives `distance: null` and no coordinates are echoed.

**Edge cases.** Concurrent resolves (one cached result). Move ends between list and tap (return nobody-there). Low-confidence resolve treated as unresolved.

**Test.** Fakes for `MuseGateway`, `MarkGateway`, `MoveGateway`: the seven criteria; plus the Muse-down heuristic draft (nearest Mark + template text).

---

## S2. Proximity sweep: join prompt, auto-join, exclusion (#25) · P1 · M4

**Goal.** Friends together + one posts a Move: the others get a one-tap prompt (or a silent add if on the auto-join list) and no FOMO nudge.

**Files.** `backend/app/services/proximity_sweep.py`, `backend/app/api/routes/proximity_prompt.py`, `backend/tests/surfaces/test_sweep.py`.
(`proximity_prompt.py` must be in T0's route stubs; it is on the fixes branch. If T0 lacks it, put the accept route in `routes/proximity.py` instead of
editing `api/main.py`.)

**Build.**
- Handler on `on_move_created(move_id, notify_user_ids)` plus a listener on `proximity.add_copresence_listener`, both wired in `lanes/surfaces.py`: for each
  cluster member in the audience and not a participant: publish `proximity.prompt`, or if on the auto-join list add as `there` (`ble_auto`) with a quiet
  `proximity_added` notification ("Added you to Anish's Move at Kumo · Undo").
- `POST /proximity/prompt/{move_id}/accept` body `{always}` joins via `MoveGateway.add_participant(joined_via='ble_prompt')`. If `always`, call
  `MoveGateway.set_autojoin(user_id, <co-present participant>)`; surfaces never writes `autojoin_prefs`.
- A prompt only names people who are already participants.
- **Exclusion is not implemented here.** The real notify pipeline (Muse M4) excludes the cluster via `ProximityGateway.copresent_cluster`, which only
  needs the `copresence` rows to exist when the Move is created; it does not depend on whether the sweep has run or on hook order.

**Acceptance.**
1. Auto-join list member is added `there` with `ble_auto` and a quiet notice, no prompt; others get exactly one `proximity.prompt` naming only participants.
2. Not-in-audience, already-participant, and blocked/hidden-from members get nothing.
3. Accept joins with `ble_prompt`; `always` calls `set_autojoin` and nothing writes `autojoin_prefs` from surfaces; accept twice is idempotent; accept for an
   ended Move is 409.
4. The same pair triggering the listener repeatedly does not re-prompt after accept or dismiss.
5. The handler reads the **committed** Move and participants (use `MoveGateway.get`, not stale hook payload), and a failure in this handler never
   affects Muse's handler (hooks swallow errors).
6. **Integration gate (Z1, listed in the asks):** with real S1 + S2 + M4, a co-present friend gets the prompt and **no** `move_nudge`, while a far friend
   gets the nudge. S2's own fakes cannot prove this.

**Edge cases.** Creator posts with no cluster (nothing sent). Move ends mid-prompt. Accept when not co-present with any participant: reject (409); `always`
then has nobody to name. Undo is core's `leave`.

**Test.** Fakes for `MoveGateway`, `Notifier`, `EventPublisher`, `ProximityGateway`: criteria 1 to 5.

---

## S3. Open Moves discovery over BLE (#26) · P2 · M5

**Goal.** Nearby, opted-in, **verified** strangers can discover and join an `open` Move, seeing only first names and verified badges.

**Files (per #26).** `backend/app/services/open_moves.py`, `backend/tests/surfaces/test_open_moves.py`. **The issue lists no route file.** Routes must live somewhere
T0 registers: ask T0 for an `open_moves` route stub, or add the three routes below to `routes/proximity.py` after S1 merges (S1 owns that file, so coordinate;
do not edit `api/main.py`).

**Public contract (to build):**
- `POST /open-moves/{move_id}/beacon`: creator only, Move must be `open`; issues a short beacon token valid 15 min, refreshable.
- Beacon tokens arrive through S1's `POST /proximity/sightings` (strangers are kept only when the token is a beacon of an open Move).
- `GET /open-moves/nearby`: cards for the caller from `open_moves_near(user_id)`: first names + verified badges + category + Mark name only.
- `POST /open-moves/{move_id}/join`: calls `MoveGateway.add_open_audience(move_id, user_id)` then `MoveGateway.add_participant(move_id, user_id, 'going', 'open_ble')`,
  **only if `open_moves_near(user_id)` contains the Move**.

**Acceptance.**
1. Unverified users cannot discover or join (403); users with discovery opt-in off see nothing.
2. Category must match the viewer's `move_categories`.
3. Join for a Move not in `open_moves_near` is rejected and calls neither gateway method; `add_open_audience` is called before `add_participant`.
4. Join twice is idempotent. Blocked users (either direction) are excluded.
5. Cards contain no last names, avatars, IDs beyond the Move id, or coordinates; stranger sightings are never listed and purge on S1's schedule.
6. If open Moves appear in the live demo, a deterministic trigger exists: extend S1's `inject_sim` to accept stranger/beacon pairs (ask S1's owner), exposed through
   `/demo/copresence`; otherwise this path is not demoed.

**Test.** Fake `MoveGateway`, `ProximityGateway`: the six criteria.

---

## S9. Glasses: shared compose/confirm service, `/mcp` connector, fallback routes (#32) · P2 · M5

**Goal.** "Hey Meta" works through a **Meta AI connector**: a remote MCP server mounted at `/mcp`. An utterance becomes a draft with a spoken
confirmation; nothing posts until an explicit confirm. The `/glasses/*` routes are now the **fallback** for the in-app voice screen. A parallel agent
builds the MCP server; this task owns the shared service and the contract it must meet (ARCHITECTURE.md 11.4).

**Files.** `backend/app/services/glasses.py`, `backend/app/api/routes/glasses.py`, `backend/app/mcp/**`, `backend/tests/surfaces/test_glasses.py`,
`backend/tests/surfaces/test_mcp.py`.

**Build.**
- **Shared service** (`services/glasses.py`): `draft(user_id, text, to, place, lat, lng)` -> `MuseGateway.parse_intent` -> `MarkGateway.nearest` (or the named
  `place`) -> `compose_move` + `MuseGateway.notify_preview` -> draft with a spoken line. `confirm(user_id, draft_id, request_id)` posts via
  `MoveGateway.create(origin=glasses)`. Non-start intents are a friendly no-op.
- **Fallback routes**: `POST /glasses/command {utterance, lat?, lng?}` and `POST /glasses/confirm`, both thin calls into the service, `X-User-Id` auth.
- **`/mcp`**: MCP Streamable HTTP, **stateless**, mounted in FastAPI at `/mcp`. `Authorization: Bearer <MCP_TOKEN>` (constant-time compare; 401 otherwise).
  Every authorized call acts as the user `MCP_USER_ID`; `X-User-Id` is ignored. If `MCP_TOKEN` is unset `/mcp` is disabled, never open.
- **Tools**: `draft_move(text, to?, place?, lat?, lng?)` (no write); `confirm_move(draft_id, request_id)` (idempotent, only after explicit user confirm);
  `share_move`; `pull_up`; `friends_nearby` (opted-in users only, places not people, no coordinates); `get_my_active_move` (safe retries). Argument
  shapes beyond those listed come from the MCP build; update ARCHITECTURE.md 11.4 if they differ.
- **Muse-down fallback (required):** a minimal local parser matches `start a move` / `send ... a move` (case-insensitive) and takes the rest as the Move
  text; used when `parse_intent` is unavailable or returns no intent. Without it the shared done-rule "works with Muse unavailable" fails.
- **Pending draft storage:** drafts keyed by `draft_id` (owned by one user) in an in-memory store with a 5-minute TTL measured by `Clock`, shared by `/mcp`
  and `/glasses/*`. Lost on process restart; `confirm` after restart or expiry returns 409 "say it again" (an error result over MCP), never posts.
  Document this limit; no table is added. Completed confirms are remembered by `request_id` for the same TTL so a retry returns the same Move.

**Open wiring (raise with T0 and core before M5).** Mounting `/mcp` needs the app object in T0's `api/main.py` (a lane may only wire itself in
`lanes/surfaces.py`); `MCP_TOKEN` / `MCP_USER_ID` belong in core-owned `core/config.py` and `.env.example`; the `mcp` dependency is in T0's
`pyproject.toml`; `share_move` (invite service, core) and `friends_nearby` (`user_settings` opt-ins, core) have no port today.

**Acceptance.**
1. Nothing posts before confirm; `draft_move` / `command` create no Move and notify nobody.
2. Confirm creates exactly one Move with `origin=glasses`; a second confirm (same `request_id` or same `draft_id`) returns the same Move, no duplicate.
3. Confirm without a draft or after expiry returns 409; another user cannot confirm someone else's draft.
4. Coordinates are used only for the nearest-Mark lookup, never stored or echoed in any result; without them the draft has no place (never fall back to
   stored GPS).
5. Muse unavailable: the fallback parser produces the draft; an unrelated utterance is the no-op.
6. Utterance text is untrusted and is escaped/truncated before it goes into the spoken line.
7. `/mcp` without or with a wrong bearer token is 401; stateless (two independent calls work with no session); `pull_up` on a Move the caller cannot see
   is refused; `friends_nearby` returns no coordinates and nobody who has not opted in.
8. Demo triggers: the connector (Meta AI on the glasses) is primary; a laptop MCP client or `curl` with the bearer token drives the same tools; the typed
   `POST /glasses/command` and the voice screen are the backups. The real "Hey Meta" wake word is Meta AI's and cannot be hooked in our app. Checking
   the glasses-as-Bluetooth-headset audio path is a frontend task outside this lane.

**Test.** Fakes for `MuseGateway`, `MarkGateway`, `MoveGateway`, fake Clock: criteria 1 to 7.

---

## Asks for other lanes (do not edit their issues without their owners)

| To | Ask | Source finding |
| --- | --- | --- |
| T0 (#1) | Merge `origin/docs/backend-task-fixes` before freeze; list `app/main.py` as T0-owned; expose an injected `reset` slot in `container`; add participant arrive/leave times to the snapshots; add `reels.resolved_mark_id` and `saved_reels` columns; add a Mark text lookup (`MarkGateway.search`); add a surfaces-owned "rating prompt sent" marker; register an `open_moves` route stub (or confirm S3 uses `proximity.py`) | 2, 3, 5, 6, 8, 10 |
| T0 (#1) | Add to the T0 tests: null-port boot, every route stub appears in OpenAPI, lane-isolation. Run them on the merge commit before assigning surfaces work | 1, 3 |
| Core (#11 C10) | Already lists the `saved_marks` row; nothing to add. Keep `kumo_reel` id shared via `seed/ids.py` | 4 (stale) |
| Z1 (#35) | Add gates: (a) real S1+S2+M4: co-present friend gets prompt and no nudge, far friend gets nudge; (b) both seeds run: Anish's `saved_reels` and `saved_marks` agree; (e) `/mcp`: `draft_move` creates nothing, `confirm_move` twice with one `request_id` makes one Move, a wrong bearer token is 401; (c) two-client replay of the demo script incl. `reset` and socket refetch; (d) end -> rating prompt -> rate -> leaderboard | 5, 6, 7, 12 |
| Frontend | Demo steps need device checks; the surfaces lane cannot satisfy them | 12 |

## REVIEW.md disposition

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | T0 blocker overstated; T0 merge is not demo readiness | **Fixed.** Status section reworded; "Start now vs blocked" added; M0/M2 labeled backend handoffs; T0 status dated and re-check instruction added. |
| 2 | Interface gaps; "fake the issue text" is unsafe | **Fixed.** Rule 5 forbids fakes that differ from `ports.py`; contract-status table; most gaps are already on the unmerged fixes branch, rest are asks. |
| 3 | T0 ownership omits files; `proximity_prompt` unregistered | **Partly stale, rest ask.** Fixes branch already gives T0 `seed.py`, `models/__init__.py`, and the `proximity_prompt` stub. `app/main.py` ownership remains an ask; S2 has a fallback route location. |
| 4 | Saved Mark undeclared in C10 | **Stale.** Live #11 already builds the `saved_marks` row. Added the cross-seed handoff check as a Z1 gate and shared `kumo_reel` id. |
| 5 | S10 reset vs ports; null responses; copresence ownership | **Fixed.** Injected `reset` callable; exact null bodies; lock, Clock reset, refetch hint. Copresence ownership: live #33 already says S1 owns it, so no change needed there. |
| 6 | S6/S8/S7 acceptance too narrow; S8 outbox | **Fixed.** Criteria promoted to acceptance; S8 decisions fixed; per-user failure isolation; the "sent marker" need is an ask. S7 flow test added. |
| 7 | S1 opt-in rule; S2/M4 exclusion gate | **Fixed.** Opt-in rule fixed with revocation/replay/boundary tests; exclusion is a Z1 gate and S2 documents it does not depend on hook order. |
| 8 | S4 save/delete and caption fallback | **Fixed with an open ask.** Follows #27 (DELETE removes only `saved_reels`), builds for the consequence, both states asserted; the Mark text lookup port is an ask and the unresolved fallback is explicit until then. |
| 9 | S5 contract unbounded | **Superseded.** The free-window contract is gone with the flare cut; S5 is deferred (no consumer). Replacement and title-dropping tests remain if it is built. |
| 10 | S3 public contract and demo trigger | **Fixed.** Routes, beacon exchange and a demo trigger defined; route-module placement is an ask. |
| 11 | S9 Muse-down fallback optional; draft storage | **Fixed, then extended.** Fallback parser required; in-memory 5 min TTL store with restart limit documented; primary path is now the `/mcp` connector, typed `/glasses/command` and the voice screen are backups. |
| 12 | Milestone claims vs frontend | **Fixed.** M0/M2 are backend handoffs; Z1 plus device checks required before a demo step is called done. |

Also noted: `REVIEW.md` says GitHub issue access returned 403. Issues were read successfully with an authenticated `gh` on 2026-11-12, and where the local
docs and the live issues differ (S4 DELETE, S10 copresence, C10 saved_marks), the live issues were followed.

## PR checklist (paste into each PR)

- [ ] Only "You own" files plus the four shared lane files; nothing in other lanes, `ports.py`, `hooks.py`, `tables/`, `api/main.py`
- [ ] Fakes match the frozen `ports.py` exactly
- [ ] Writes only surfaces tables; cross-lane via ports
- [ ] `cd backend && uv run pytest tests/surfaces tests/contract && uv run ruff check . && uv run ruff format --check .`
- [ ] Works with other lanes on null ports and with Muse unavailable
- [ ] No coordinates or "who is near me" list in any response; times via `Clock`
- [ ] Branch `surfaces/<id>-name`; PR body `Closes #<issue>`
