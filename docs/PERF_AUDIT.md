# Backend performance audit (2026-11-13)

Trigger: the self-hosted backend (meta.anishalle.com) froze at 06:08 UTC. Every request ended in 499 and
`/docs` hung for 40 s.

## What the frozen process showed

- `QueuePool limit of size 5 overflow 10 reached` errors, starting in the scheduler jobs.
- Postgres had 13 connections **idle in transaction for ~715 s**. In each one the last query was the
  current-user lookup (`SELECT … FROM users WHERE id = $1`).
- All 12 threads were parked, including the event loop.
- Round trip to Timescale: **~69 ms per query**, plus ~440 ms to open a new connection. `pool_pre_ping` adds
  1 more round trip on each checkout.
- `muse_runs`, last 24 h:
  - `move_ranker` made 311 calls (87% of all Muse calls), p90 9.5 s, max 53.7 s.
  - `notify_picker` fell back in 3 of 4 calls, at 41 s each.

**It is a deadlock, not a true leak.** Every Session does close eventually. But connections are held across
Muse awaits that can take 40 s or more. Separately, `async def` code makes *blocking* pool checkouts on the
event-loop thread. Once 15 connections are held by suspended coroutines, the loop blocks in `QueuePool.get`
for 30 s. Nothing can release a connection in that time, because the coroutines holding them need the loop.
After the timeout, the next checkout blocks again. Retrying clients keep this going forever.

## Tier 1: stop the freeze (small diffs)

| # | Fix | Where |
|---|---|---|
| 1 | Never hold a connection while awaiting Muse: read, then close or commit, then await Muse, then do the write in a new short session | `muse/lane.py:71` (`MuseLane.call`), `muse/agents/move_ranker.py:121`, `muse/agents/flare.py:138`, nobody_bit scan, `services/suggestions.py:180` |
| 2 | Add a ranker concurrency cap (semaphore ~3); the heuristic runs off the loop | `muse/agents/move_ranker.py:104-108` |
| 3 | Fail fast and drop the extra round trip: `pool_timeout=5`, `pool_size=10`, `max_overflow=10`, keepalives instead of `pool_pre_ping` | `core/db.py:45` |
| 4 | No blocking DB work on the loop: make DB-only async routes `def`, or wrap them in `run_in_threadpool`; same for sync scheduler jobs | `api/routes/moves.py:185-214`, `scheduler/loop.py:69` |
| 5 | Run `on_move_created` and the rating taste update in the background, not inline (POST /moves currently waits up to 40 s on `notify_picker`) | `services/moves.py:168,393`, `services/ratings.py:185` |
| 6 | One shared `httpx.AsyncClient` plus a semaphore for Muse (today every call opens a new TLS connection) | `muse/client.py:141` |
| 7 | `/areas/city`: don't hold the request session while waiting on the global Nominatim lock; return the fallback label at once | `services/cities.py:84-93`, `api/routes/areas.py:39` |

## Tier 2: fewer round trips

- **Client fan-out.**
  - `useLive.load` fires 3 to 5 requests every 20 s and on every `RELOAD_ON` event, including plain
    `notification`.
  - The home feed refetches on the same events.
  - `moveDetail` reloads every Move ever opened on socket open.
  - `city.ts` doesn't dedupe in-flight calls, and map animations fire 5 to 6 `/areas/city` calls at once.
  - Fix: one `GET /moves/map` endpoint, skip polling while the socket is open, and in-flight guards
    (`lib/live.ts`, `lib/homeFeed.ts`, `lib/moveDetail.ts`, `lib/city.ts`, `lib/friends.ts`).
- **Presenter audience N+1.** About 5 queries per own Move on feed, nearby and detail; lists don't use it
  (`routes/moves.py:135`, `repositories/audience.py:129`).
- **`/friends` and `/friends/requests` N+1** (`services/users.py:194`, `services/friends.py:337`).
- **`/moves/{id}/invites`** opens 2 extra sessions, about 17 round trips (`services/invites.py:141`).
- **`record_near_area` writes on GET**, on both nearby endpoints; `saved_ids` runs twice
  (`services/marks.py:211,252`).
- **Ranker cache.**
  - It is keyed by the exact Move set, so feed and nearby miss separately.
  - It doesn't serve a stale result while refreshing.
  - The prompt includes minute-level ages, so the runner's prompt cache never hits.
  - Neither cache evicts.
- **Indexes** (no migrations, so create them by hand): `notifications(user_id, created_at desc)`,
  `moves(status, starts_at)`, `moments(move_id, status)`.

## Round trips per request today (incl. ~3 checkout overhead, ~69 ms each)

| Endpoint | Round trips |
|---|---|
| `/moves/feed` | ~11 + 5 per own Move (+~12 on a ranker miss) |
| `/moves/nearby` | ~12-14 + 5 per own Move |
| `/marks/nearby` | ~12 |
| `/moves/{id}` | 11-16 |
| `/moves/{id}/invites` | ~17 |
| `/friends` | 7 + one per friend |
| `/friends/requests` | 9 + 2 per request |
| `/notifications`, `/me`, `/me/taste` | 5 |
