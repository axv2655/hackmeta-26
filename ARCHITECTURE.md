# Spontaneous: Architecture and Build Spec

Working name: **Spontaneous** (the feature is "Moves"). Meta Career Programs AI Hackathon 2026.
Submission: **Friday 10:30 a.m.** Judging is a live demo to five judges in a private room.

This document is the single source of truth for every agent building this app. Read
sections 1 to 5 before touching code. Then go to the section for your workstream (section 17).
If something here conflicts with a team decision made later, update this file in the same change.

---

## 1. Product in one page

### 1.1 The prompt

"Build the AI-powered Facebook feature you wish existed for young adults." AI must be
essential, not decorative. **The Muse model API must power the core AI.** We mock the
Facebook surface; we never touch production Facebook code.

### 1.2 The idea

RSVPs are friction: "Am I free Wednesday? I don't know. But I know if I'm free *now*."
People don't want to create events or choose from options. They already share what they
are doing. So:

- A **Move** is a post of what you are already doing or about to do: "I'm going to
  Chipotle", "study with me at this coffee shop". No event to create, nothing to RSVP to
  days ahead.
- Friends get notified and **pull up**: tap "I'm going", or ignore it.
- A **Mark** is a pin on the map. The map is like Snap Map but shows *activities at places*,
  never people's live positions.
- **Muse** decides who hears about a Move, ranks Moves for you, notices free time and
  saved places and proposes Moves on its own, learns group taste from ratings, and
  revives groups that are going quiet.

### 1.3 Growth loop (the pitch)

Share a Move → the right people get a personal nudge → they pull up → moments are captured
→ ghosts and moments on the map create FOMO for people who missed it → they pull up next
time or start their own Move → ratings and leaderboards keep them coming back. This turns
Facebook Groups into personal, curated, real-world experiences for people in their 20s.
Reels watch time becomes real-world engagement.

### 1.4 Vocabulary (use these exact words in code and UI)

| Term | Meaning |
| --- | --- |
| Move | A live, spontaneous activity at a place, posted by a user. |
| Mark | A place pin on the map. Has a category that sets its icon. |
| Saved Mark | A Mark a user saved (from the map or a Reel). |
| Pull up | Join a Move ("I'm going"). |
| Flare | A Move with a short fill window (5 to 10 min), usually proposed by Muse for a calendar gap. |
| Ghost | The gray avatar left at a Mark after a user leaves a Move. Tapping shows Moments. |
| Moment | A photo or clip captured during a Move. |
| Circle | A user-defined audience group ("Roommates", "HS friends"). Maps to a Facebook Group in the real product. |
| Pseudo-group | A cluster Muse infers from history ("the people you get coffee with on weekday afternoons"). Never a real group; only used for suggestions. |
| Open Move | A Move explicitly marked open so nearby strangers can discover it over BLE. Off by default. |

### 1.5 Non-negotiable product rules

These came from both mentors as the biggest risk. Every feature must obey them.

1. **Location is always opt-in.** The app works with location permission denied (you pick a Mark by search).
2. **Never show live location.** A Move shows a *place*. Avatars are pinned to the Mark's coordinates, never to GPS coordinates. **Raw user GPS never leaves the device** except as a coarse "near" query for the map (rounded to ~3 decimal places, not stored).
3. **Never fully public.** A Move goes to Circles and people the poster chooses. "Open" only widens discovery to physically nearby people over BLE, and only when the poster turns it on.
4. **It is always obvious who will see a post.** The composer shows an audience line ("Visible to 9 people: Roommates, Priya, Tony") before posting, and every Move card shows who can see it to the poster.
5. **Everything proximity-based is a one-tap prompt by default.** Silent auto-join only happens for people a user has explicitly put on their auto-join list.
6. **Muse proposes, the user disposes.** Muse never posts a Move or sends a flare without a tap. It can send *you* a suggestion.
7. **Moments need approval.** Anyone tagged in a Moment approves it before it is visible beyond the people who were in the Move.

**Velocity note (team decision):** build these rules in as written, but do not let
privacy edge cases block feature work. There is a dedicated **privacy pass at the end**
(section 12.5) that re-checks every rule and settles the open questions.

### 1.6 Decided against (do not build)

- The spin-wheel random restaurant picker.
- Creating events, RSVPs days ahead, or "choose from options" polls.
- Showing live location. Fully public posting.
- Building on real Facebook code.
- Positioning as a dating app (it sits between dating and casual hangouts).
- A recording feature.
- Agent-to-agent coordination of future Moves (it is planning ahead, which is the thing we removed).
- Marketplace pickup Moves and the safety check-in. Pitch line only (section 11.3).
- The auto recap Reel. Ghosts and Moments already carry the FOMO.
- Glasses "save this place" and POV moments. Only "Hey Meta, start a Move" is built.
- Crew and Movers leaderboards.

---

## 2. Scope tiers

One day. Build P0 end to end first, then P1 in order. P2 only if P0 and P1 are demo-solid.

| Tier | Feature | Section |
| --- | --- | --- |
| **P0** | Mocked Facebook shell with a Moves tab | 6 |
| **P0** | Map of Marks with category icons, active Moves, Move sheet | 7.1 |
| **P0** | Share a Move (composer with audience line) | 7.2 |
| **P0** | Pull up ("I'm going"), arrive, leave | 7.3 |
| **P0** | Realtime in-app notifications with personal copy | 9 |
| **P0** | Muse notify picker and Move text writer | 10.3, 10.4 |
| **P0** | Muse ranking of nearby Moves | 10.5 |
| **P0** | Privacy: Circles, audience preview, settings, verified badge | 12 |
| **P0** | Seed data and Demo Control panel | 15 |
| **P1** | Reel → "Start a Move here" chip and sheet | 11.1 |
| **P1** | Saved Reel → Muse calendar flare (the autonomous agent story) | 11.2 |
| **P1** | Ghosts, Moments, ghost sheet | 7.4 |
| **P1** | Proximity: one-tap join prompt, FOMO notification skip (simulated path first) | 8 |
| **P1** | Post-Move rating (one tap + pairwise), taste profile, ranked lists, Top spots board | 10.7, 13 |
| **P1** | Revive quiet groups | 10.8 |
| **P1** | "Nobody bit" path: Muse points you to a live Move you can join | 10.9 |
| **P1** | Real BLE on two phones (simulated path stays as fallback) | 8 |
| **P2** | Meta glasses: "Hey Meta, start a Move" (real glasses if we can get audio in, else voice on the phone) | 11.4 |
| **P2** | Ride and route suggestions | 10.10 |
| **P2** | Open Moves discovered by people nearby over BLE | 8.5 |

**Demo-safety rule:** every P1/P2 feature that depends on hardware or timing (BLE, push,
calendar, voice, fill timers) must have a trigger in the Demo Control panel
(section 15) that fires the same code path deterministically.

---

## 3. System overview

```text
┌──────────────────────── Phones (Expo / React Native, TypeScript) ───────────────────────┐
│  Mock Facebook shell: Feed · Reels · Moves (map) · Notifications · Menu   │
│  Local: geofence check (arrive/leave), BLE scan + advertise, calendar read, camera      │
└───────────────┬─────────────────────────────────────────────┬───────────────────────────┘
                │ REST  /api/v1/*  (X-User-Id header)          │ WebSocket /api/v1/ws
                ▼                                             ▼
┌──────────────────────────────── FastAPI backend (Python 3.12) ──────────────────────────┐
│ api/routes      thin HTTP handlers + WS endpoint                                        │
│ services        use cases: moves, notify, proximity, ratings, leaderboards, reels           │
│ muse/           MuseClient port + adapter, one module per agent, prompts, fallbacks     │
│ realtime/       ConnectionHub: user_id → sockets, publish(event)                        │
│ scheduler/      asyncio loop: move expiry, empty-flare follow-up, flare scan, revive scan       │
│ repositories    SQLModel over SQLite (file: backend/data/app.db)                        │
└───────────────┬─────────────────────────────────────────────────────────────────────────┘
                │ HTTPS
                ▼
        Muse model API (hackathon-provided; $100 token budget)
```

### 3.1 Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Client | Expo SDK 57, React Native 0.86, TypeScript, expo-router | Already scaffolded. One codebase for the demo phones. |
| Build type | **Expo dev build** (EAS or `expo run:ios`) for BLE; app must also run in Expo Go with BLE simulated | BLE needs native modules. Expo Go fallback keeps everyone unblocked. |
| Map | `react-native-maps` (Apple Maps on iOS) | Works in Expo Go, no API key on iOS. |
| Backend | Existing FastAPI layered template | Already scaffolded; keep the inward-dependency rule from `backend/ARCHITECTURE.md`. |
| Storage | SQLite via SQLModel, one file, recreated from seed on demand | Zero setup, relational joins for affinity queries, easy reset before the demo. |
| Realtime | One WebSocket per client, server push only | Simpler and more reliable on venue Wi-Fi than push notifications. |
| Push | In-app banners from WebSocket events + `expo-notifications` **local** notifications for lock-screen effect | Remote push needs credentials and a dev build; local notifications give the same visual. |
| Auth | Mocked "Continue with Facebook": pick a seeded user. `X-User-Id` header | No real auth in a one-day demo. Verified badge is a seeded flag. |
| AI | Muse behind a `MuseClient` port, JSON-only outputs, heuristic fallback for every agent | Muse is essential, but a failed call must never break the live demo. |
| Places | Seeded `marks` table for the demo area, plus user-created Marks | No external Places API dependency. |
| Hosting | Laptop on the same Wi-Fi (`--host 0.0.0.0`) with a tunnel as backup (`EXPO_PUBLIC_BACKEND_URL`) | Already supported by `frontend/lib/backend.js`. |

### 3.2 Muse API: first thing to verify

The exact Muse API shape is **not known in this repo**. Before building any agent:

1. Get base URL, auth scheme, model id, and whether it supports JSON/structured output, tool calls, and image input.
2. Put them in `backend/.env` (`MUSE_BASE_URL`, `MUSE_API_KEY`, `MUSE_MODEL`, optional `MUSE_VISION_MODEL`).
3. Implement only `backend/app/muse/client.py::HttpMuseClient.complete()` against the real shape. Nothing else in the codebase may know the wire format.
4. Measure tokens and cost per call with the `muse_runs` log (section 10.2). The kickoff warned teams about burning the $100 budget.

If Muse has no image input, the place-from-visuals paths (a Reel frame) fall
back to caption/geotag text and nearest-Mark lookup.

---

## 4. Repository layout

```text
hackmeta-26/
├── ARCHITECTURE.md                 ← this file
├── backend/
│   ├── app/
│   │   ├── main.py                 app factory, lifespan starts scheduler
│   │   ├── core/
│   │   │   ├── config.py           Settings (add MUSE_*, DB_PATH, DEMO_MODE)
│   │   │   ├── db.py               engine, get_session, create_all
│   │   │   └── clock.py            Clock with demo time offset (section 15.2)
│   │   ├── domain/                 pure rules, no imports from app
│   │   │   ├── moves.py            Move state machine, visibility rules
│   │   │   ├── privacy.py          can_see(), audience resolution
│   │   │   ├── affinity.py         affinity score math
│   │   │   ├── ranking.py          Beli-style pairwise ranking → 0–10 score
│   │   │   └── errors.py
│   │   ├── tables.py               SQLModel tables (section 5)
│   │   ├── models.py               request/response schemas (section 14)
│   │   ├── repositories/           one module per aggregate
│   │   ├── services/
│   │   │   ├── moves.py  notify.py  proximity.py  moments.py  ratings.py
│   │   │   ├── leaderboards.py  reels.py
│   │   │   ├── circles.py  marks.py  calendar.py  glasses.py
│   │   ├── muse/
│   │   │   ├── client.py           MuseClient Protocol, HttpMuseClient, FakeMuseClient
│   │   │   ├── runner.py           run_agent(): prompt, call, parse, validate, log, fallback
│   │   │   ├── context.py          builds compact user/social context blocks
│   │   │   ├── prompts/            one .md per agent
│   │   │   └── agents/
│   │   │       ├── notify_picker.py  move_writer.py  move_ranker.py
│   │   │       ├── flare.py  place_resolver.py  taste.py  revive.py
│   │   │       ├── nobody_bit.py  route.py  intent.py
│   │   ├── realtime/hub.py         ConnectionHub
│   │   ├── scheduler/loop.py       periodic jobs
│   │   ├── api/
│   │   │   ├── deps.py  errors.py  main.py
│   │   │   └── routes/
│   │   │       ├── auth.py  users.py  circles.py  marks.py  moves.py
│   │   │       ├── moments.py  notifications.py  proximity.py  muse.py
│   │   │       ├── ratings.py  leaderboards.py  reels.py
│   │   │       ├── calendar.py  glasses.py  demo.py  ws.py
│   │   └── seed/
│   │       ├── seed.py             builds the demo world (section 15.1)
│   │       └── assets/             avatars, reel thumbnails, moment photos
│   ├── data/                       app.db (gitignored), uploads/
│   └── tests/
└── frontend/
    ├── app/                        expo-router routes
    │   ├── _layout.tsx             providers: session, query client, realtime, banners
    │   ├── login.tsx               "Continue with Facebook" user picker
    │   ├── (tabs)/
    │   │   ├── _layout.tsx         mock Facebook tab bar
    │   │   ├── index.tsx           Feed (mock, with Move cards and Muse cards)
    │   │   ├── reels.tsx           Reels feed with place chip
    │   │   ├── moves.tsx           Map of Marks (the core surface)
    │   │   ├── profile.tsx         mock Facebook profile
    │   │   ├── notifications.tsx
    │   │   └── menu.tsx            profile, Circles, privacy, saved, leaderboards, demo
    │   ├── move/new.tsx            composer (modal)
    │   ├── move/[id].tsx           Move detail
    │   ├── move/[id]/rate.tsx      post-Move rating
    │   ├── mark/[id].tsx           Mark detail: ghosts, moments, ranked score
    │   ├── saved.tsx               Saved Marks and saved Reels
    │   ├── leaderboards.tsx
    │   ├── circles/index.tsx  circles/[id].tsx
    │   ├── privacy.tsx
        │   ├── glasses.tsx             "Hey Meta, start a Move" voice screen
    │   └── demo.tsx                Demo Control panel
    ├── components/
    │   ├── fb/                     mock Facebook chrome (header, tab bar, post card)
    │   ├── map/                    MarkPin, AvatarStack, GhostAvatar, MoveSheet
    │   ├── move/                   MoveCard, AudienceLine, PullUpButton, FillTimer
    │   ├── muse/                   MuseCard, ReasoningChips
    │   └── ui/                     Button, Sheet, Avatar, Banner, Chip
    ├── lib/
    │   ├── backend.ts              typed fetch helper (port of backend.js, adds X-User-Id)
    │   ├── api.ts                  typed endpoint functions
    │   ├── types.ts                mirrors backend schemas (section 14)
    │   ├── realtime.ts             WebSocket client with reconnect
    │   ├── session.tsx             current user context (AsyncStorage)
    │   ├── geofence.ts             arrive/leave detection on device
    │   ├── proximity/              ble.ts (real), sim.ts (simulated), index.ts (picks one)
    │   ├── calendar.ts             expo-calendar read or mock
    │   ├── notify.ts               banners + local notifications
    │   └── theme.ts                tokens (mock Facebook look)
    └── assets/
```

Frontend additions to install: `expo-router`, `react-native-maps`, `expo-location`,
`expo-notifications`, `expo-calendar`, `expo-image-picker`, `expo-image`, `expo-haptics`,
`expo-speech-recognition` (P2), `@tanstack/react-query`, `zustand`,
`@gorhom/bottom-sheet`, `react-native-reanimated`, `react-native-gesture-handler`,
`@react-native-async-storage/async-storage`, and for real BLE `react-native-ble-plx`
(scan) plus `react-native-ble-advertiser` or equivalent (advertise). Use `npx expo install`
so versions match SDK 57. Convert `App.js`/`index.js` to the expo-router entry.

Backend additions: `sqlmodel`, `httpx` (move from dev to runtime), `python-multipart`.

---

## 5. Data model

SQLite, SQLModel. IDs are short string UUIDs. All timestamps are UTC ISO 8601. Tables
live in `backend/app/tables.py`.

### 5.1 People and audiences

```text
users
  id, name, first_name, avatar_url, avatar_color
  fb_verified: bool                 mocked Facebook verification badge
  home_area: str                    e.g. "UT Dallas"
  created_at

friendships                         undirected; store one row with user_a < user_b
  user_a, user_b, since

circles                             user-defined audiences (≈ Facebook Groups)
  id, owner_id, name, emoji, fb_group_name (nullable, for the "Groups tie-in" label)

circle_members
  circle_id, user_id

blocks                              "never show my Moves to" (parents, exes)
  user_id, hidden_from_user_id

user_settings                       one row per user
  user_id
  location_opt_in: bool             default false
  ble_opt_in: bool                  default false
  calendar_opt_in: bool             default false
  muse_proactive: bool              default true (Muse may send suggestions)
  default_circle_ids: json[str]
  move_categories: json[str]        categories the user wants to hear about
  quiet_hours: json {start,end}     local hours, no notifications
  ghost_visible: bool               default true (leave a ghost after Moves)

autojoin_prefs                      "auto-join with these people"
  user_id, other_user_id            directional: user allows silent auto-join when with other
```

### 5.2 Places

```text
marks
  id, name, category, lat, lng, address
  photo_url, price_level, vibe_tags: json[str]   e.g. ["aesthetic","quiet","outlets"]
  source: seed | user | reel
  created_by (nullable)

saved_marks
  user_id, mark_id, source: map | reel, source_ref (reel id), note, saved_at
  flared_at (nullable)              last time Muse proposed this save, to avoid repeats
```

**Mark categories** (each has its own icon and color; the list is closed):

| category | icon idea | examples |
| --- | --- | --- |
| `food` | bowl | Chipotle, tacos |
| `coffee` | cup | coffee, matcha, boba |
| `study` | book | library, study room |
| `fitness` | dumbbell | gym, pickleball, run |
| `nightlife` | disco ball | bar, party |
| `outdoors` | tree | park, hike |
| `games` | controller | arcade, board games, TopGolf |
| `shopping` | bag | mall, thrift |
| `errand` | box | moving help, airport run |
| `other` | sparkle | anything else |

Category is set by the place when known and can be overridden by Muse's Move writer
(a "study with me" Move at a coffee shop renders with the `study` icon).

### 5.3 Moves

```text
moves
  id, creator_id, mark_id
  text                              "getting matcha, who's down?"
  category                          Mark category or override
  status: live | ended | cancelled
  kind: move | flare
  open: bool                        discoverable by nearby strangers over BLE; default false
  starts_at                         now
  fill_deadline (nullable)          flares: now + 5–10 min
  ends_at (nullable)                set when ended; scheduler auto-ends (section 7.3)
  origin: manual | map | reel | saved_flare | free_time | revive | glasses | nobody_bit
  origin_ref (nullable)             reel id, suggestion id
  created_at

move_audience                       exactly who can see it (resolved at post time)
  move_id, user_id, via: circle:<id> | direct | open_ble

move_audience_circles               kept for the "Visible to: Roommates, …" label
  move_id, circle_id

move_participants
  move_id, user_id
  status: going | there | left
  joined_via: creator | tap | ble_prompt | ble_auto | open_ble
  joined_at, arrived_at, left_at

moments
  id, move_id, mark_id, author_id, media_url, media_type: photo | clip
  caption, created_at
  status: pending | approved        approved when every tagged user has approved

moment_tags
  moment_id, user_id, approved: bool | null
```

### 5.4 Signals and AI state

```text
proximity_sightings                 raw co-presence evidence, short-lived (purge > 2h)
  observer_id, observed_id, rssi, seen_at, source: ble | sim

copresence                          derived: pairs together right now
  user_a, user_b, first_seen, last_seen

hangouts                            derived history: one row per pair per ended Move both attended
  user_a, user_b, move_id, mark_id, category, weekday, hour_bucket, at

ratings
  id, move_id, user_id, mark_id
  stars: 1..5 (quick tap), vibe_tags: json[str], note
  comparisons: json [{other_mark_id, preferred: this | other}]    pairwise answers
  created_at

mark_rankings                       per-user Beli-style ordered list
  user_id, mark_id, category, position, score (0.0–10.0)

taste_profiles                      Muse-written, per user and per pseudo-group
  id, subject_type: user | pseudo_group, subject_id
  summary                           "likes quiet aesthetic coffee shops, not chains"
  likes: json[str], dislikes: json[str], updated_at

pseudo_groups                       Muse-inferred clusters, never shown as real groups
  id, owner_id, label               "weekday coffee crew"
  member_ids: json[str]
  pattern: json {categories, weekdays, hour_buckets, mark_ids}
  strength: float, last_hangout_at
  fading: bool

suggestions                         anything Muse proposes to a user
  id, user_id, type: flare | free_time | revive | route | reel_move | nobody_bit
  payload: json                     draft Move + reasoning chips
  status: pending | accepted | dismissed | expired
  created_at, expires_at

notifications
  id, user_id, type, title, body, data: json (deep link target)
  read_at, created_at

muse_runs                           audit + cost log for every Muse call
  id, agent, user_id, input_tokens, output_tokens, latency_ms
  ok: bool, used_fallback: bool, prompt_hash, output: json, created_at
```

### 5.5 Mocked Facebook surfaces

```text
calendar_events    user_id, title, starts_at, ends_at, location     (mock calendar)
reels              id, author_name, video_url, thumb_url, caption, geotag_mark_id (nullable),
                   resolved_mark_id (nullable, written by place resolver), likes
saved_reels        user_id, reel_id, saved_at
```

---

## 6. Mock Facebook shell

The app must read as "this is Facebook with a new tab", not as a separate app.

- Bottom tab bar in Facebook's order and style: **Home · Reels · Moves · Profile ·
  Notifications · Menu** (six tabs, matching the current Facebook iOS bar). Moves takes
  the slot where Friends would be.
- Header: the Facebook wordmark on the left; plus, search and Messenger icons on the right
  (flat black, no gray circles).
- Logos (team decision): the mock uses the real Facebook wordmark, f logo and Meta logo,
  as SVG path data in `frontend/assets/brand/` and `components/fb/brand/`. Generic icons
  come from `lucide-react-native`; Facebook-specific glyphs are drawn in
  `components/ui/Icon.tsx`.
- Mock content uses the seeded cast and invented pages ("Kumo Matcha", "UTD Climbing",
  "Richardson Now"), never real brands or news outlets. Placeholder photos are bundled
  under `frontend/assets/mock/` (Unsplash photos, randomuser.me portraits).
- Home feed is a static list of mock posts with two live inserts: **Move cards** from
  friends ("Tony is at Kumo Matcha with 2 others · I'm going") and **Muse cards**
  (pending `suggestions`).
- Groups tie-in: a Circle may carry an `fb_group_name`. Where it does, the UI labels it
  with a small "Group" tag, and the composer says "Share to group: UTD Climbing".
- Login screen: a list of seeded users under a "Continue with Facebook" header. Picking
  one stores `userId` in AsyncStorage. Verified users show a blue check everywhere.

Use the design skills in `.claude/skills/` (`apple-design`, `emil-design-eng`,
`animate-expo`) for polish once the flows work.

---

## 7. Core loop

### 7.1 Map of Marks (`(tabs)/moves.tsx`)

- `react-native-maps` full screen. Initial region: user's coarse location if opted in,
  else `home_area` center from seed.
- Data: `GET /moves/nearby?lat&lng&radius_km` returns active Moves visible to the user,
  already ranked by Muse (section 10.5), plus `GET /marks/nearby` for Saved Marks and
  Marks that have ghosts.
- **Pin rendering (`MarkPin`)**:
  - Active Move: category icon in a colored bubble, with an **avatar stack** of
    participants whose status is `there` (up to 3, then "+N"). `going` participants show
    as a small count ("2 on the way"), not as avatars at the pin.
  - Ghosts only: gray category icon with gray avatar stack (section 7.4).
  - Saved Mark with no activity: small bookmark pin.
- Above the map: a horizontally scrolling "For you" strip of the top 3 ranked Moves with
  Muse's one-line reason ("Tony + Priya · you've been here 4 times").
- Tap a pin → `MoveSheet` bottom sheet: Mark name, Move text, who's there, who's on the
  way, audience line (to the creator), fill timer for flares, **I'm going** button,
  Save Mark, and Moments row.
- Floating **Share a Move** button opens the composer.
- Realtime: subscribe to `move.created`, `move.updated`, `move.ended`,
  `participant.changed` and patch the query cache.

### 7.2 Share a Move (`move/new.tsx`)

Target: under 10 seconds, two taps when Muse's draft is right.

1. **Where.** If location is opted in, the client sends coarse coordinates to
   `POST /muse/compose-move` and gets the nearest Marks. First option is preselected
   ("You're at Kumo Matcha?"). Otherwise search Marks by name, or drop a new Mark.
2. **What.** A text field prefilled by Muse's Move writer (section 10.4), with three
   alternate chips ("study sesh", "grabbing food", "just vibing"). Category icon shown.
3. **Who.** Circle chips (defaults from `default_circle_ids`) plus individual friends.
   Under them, the **AudienceLine**: "Visible to 9 people: Roommates, Climbing, Priya".
   Tapping it lists every name. Blocked users are excluded and never listed.
4. **Muse's notify list.** "Muse will nudge 4 of them: Anish, Priya, Tony, Maya" with a
   reason chip each. The user can add or remove people. Everyone else in the audience
   sees the Move on the map and feed without a notification.
5. Toggles: **Open to people nearby** (off; explains "people physically near you doing
   the same thing can see this"), **Fill window** (off / 5 / 10 min).
6. **Post** → `POST /moves`.

Server on `POST /moves`:

1. Resolve audience: union of selected Circle members and direct picks, minus blocks, minus self. Write `move_audience`.
2. Create the Move, add the creator as participant (`there` if the client says it is inside the geofence, else `going`).
3. Run the proximity sweep (section 8.3): co-present friends get a join prompt or are auto-joined.
4. Run the notify pipeline (section 9.2) for the rest.
5. Publish `move.created` to every audience member's socket.

### 7.3 Pull up, arrive, leave

State machine for `move_participants.status`:

```text
(none) ──I'm going──▶ going ──arrive──▶ there ──leave──▶ left
   └────────── BLE prompt / auto-join ─────▶ there
```

- **I'm going**: `POST /moves/{id}/join`. Server adds participant, publishes
  `participant.changed`, and notifies the creator and current participants
  ("Priya is pulling up"). Then it runs a *second-order notify*: the joiner's own
  close friends who are in the Move's audience and haven't been notified get a nudge
  ("Priya's pulling up to Tony's Move at Kumo"). This is the "your friends get notified"
  half of the solo-discovery loop. It never widens the audience.
- **Arrive**: detected on device. `lib/geofence.ts` compares the device position to the
  Mark's coordinates (radius 75 m) while the user has a `going` Move, and calls
  `POST /moves/{id}/arrive`. The server never receives the coordinates. Manual
  "I'm here" button is always available. BLE co-presence with someone already `there`
  also counts as arrival.
- **Leave**: `POST /moves/{id}/leave` from the "Leave" button, or from the geofence
  (outside 150 m for 3 minutes). The participant becomes a ghost.
- **End**: a Move ends when the creator ends it, when every participant has left, or by
  the scheduler 3 hours after `starts_at` with no activity. A Move or flare
  that gets nobody triggers the "nobody bit" path (section 10.9) instead of a failure
  message.
- On end, the server writes `hangouts` rows for every pair that was `there`, and sends
  each participant a rating prompt (section 13).

**Solo discovery** is the same machinery from the other side: open the map, tap a Move,
"I'm going", friends get the second-order nudge.

**Reach beyond the group chat**: Circles like "HS friends" exist so people you would
never text directly are in the audience. They see the Move on the map and feed; Muse
decides whether any of them get an actual notification.

### 7.4 Avatar trails, ghosts, Moments

- While `there`: full-color avatar at the Mark's coordinates (never GPS).
- After `left` or Move end: gray avatar ("ghost mode") at the same Mark for 24 hours, if
  `ghost_visible` is on. Ghost visibility uses the original `move_audience`.
- Tap a ghost → `mark/[id].tsx` ghost sheet: "Tony, Maya and Priya were here 2h ago",
  the Move text, and its **Moments** in a horizontal viewer. CTA: "Nudge me next time
  they're out" (stores a preference that boosts those people in the notify picker).
- **Moments**: during a Move, any participant can add a photo (`expo-image-picker`
  camera) via `POST /moves/{id}/moments` (multipart). The author tags who is in it.
  Tagged users get an approve/decline prompt. A Moment is visible to Move participants
  immediately and to the rest of the audience only once all tags are approved.

---

## 8. Proximity (BLE)

### 8.1 What it is for

1. **Group auto-join**: if your group is physically together and one of you posts a
   Move, the rest are added with one tap or silently for people on their auto-join list.
2. **FOMO targeting**: people already there get no notification; everyone else does.
3. **Open Moves** (P2): strangers physically nearby can discover a Move marked open.

### 8.2 Abstraction

`frontend/lib/proximity/index.ts` exports one interface with two implementations:

```ts
interface Proximity {
  start(): Promise<void>;          // begin advertise + scan (needs ble_opt_in)
  stop(): void;
  onSightings(cb: (s: Sighting[]) => void): void;
}
type Sighting = { token: string; rssi: number; seenAt: string };
```

- `ble.ts` (dev build): advertises service UUID `SPONT_SERVICE_UUID` with a 8-byte
  **rotating token** as service data, scans for the same UUID, batches sightings every
  10 s to `POST /proximity/sightings`.
- `sim.ts` (Expo Go and demo fallback): no radio. Co-presence is injected by the Demo
  Control panel through `POST /demo/copresence`.
- `index.ts` picks `ble.ts` when the native module is present and `ble_opt_in` is true.

**Tokens**: `POST /proximity/token` returns a random token valid for 15 minutes; the
server maps token → user. Devices never broadcast user IDs. Strangers cannot resolve a
token; only the server can, and it only reveals identities allowed by section 8.4.

iOS notes: add `NSBluetoothAlwaysUsageDescription`; foreground-only is fine for the demo
(backgrounded iOS advertising drops service data). The simulator has no BLE.

**Real BLE is a goal, not a stretch.** Start it early on two physical phones, in
parallel with the simulated path, because advertising from React Native is the least
certain part of the stack. Order of attack: (1) scan-only proof that phone A sees phone
B's advertisement, (2) token in service data, (3) sightings to the server, (4) the join
prompt. If advertising from JS libraries fails, a small Expo native module wrapping
`CBPeripheralManager` (see the `write-swift` skill) is the next option. `sim.ts` stays
so the demo never depends on the radio.

### 8.3 Server logic (`services/proximity.py`)

- `ingest(observer, sightings)`: resolve tokens, keep sightings with RSSI ≥ −75 dBm,
  upsert `copresence` for pairs that are **friends** (strangers are only kept for open
  Moves, section 8.5). A pair is co-present if seen within the last 60 s.
- `cluster(user)`: connected component of the co-presence graph containing the user.
- **Sweep**, run on Move creation and whenever co-presence changes for a participant
  who is `there`:
  - For each cluster member M who is in the Move's audience and not a participant:
    - If M has `autojoin_prefs` for the participant they are with → add M as `there`
      with `joined_via: ble_auto`, and send M a quiet confirmation
      ("Added you to Anish's Move at Kumo · Undo").
    - Else send M a **join prompt** event (`proximity.prompt`):
      "You're with Anish and Maya. Add yourself to their Move?" One tap joins as
      `there` (`ble_prompt`). The prompt also offers "Always auto-join with Anish".
  - Cluster members are added to the Move's **notify exclusion set** whether or not
    they tap, so they never get the FOMO notification.

### 8.4 Privacy rules for proximity

- BLE is off until `ble_opt_in`. The permission screen says what it is used for.
- Co-presence is only computed between friends, is never shown as a list ("who's near
  me" does not exist), and raw sightings are purged after 2 hours.
- A prompt only names people who are already participants of the Move in question.

### 8.5 Open Moves and people nearby (P2)

- Only for Moves with `open: true`. The creator's device advertises a second service
  data field: a short Move beacon token.
- A nearby user who has opted in to "discover open Moves" and whose
  `move_categories` include the Move's category gets a card: "3 people nearby are
  studying at Founders Hall · open Move". They see first names and verified badges
  only. Unverified users cannot see or join open Moves.
- Joining adds them to `move_audience` with `via: open_ble`. This softens the awkward
  first approach: both sides already know the other opted in.

---

## 9. Notifications

### 9.1 Transport

- **WebSocket** `GET /api/v1/ws?user_id=…`. Server → client JSON events:
  `{ "type": "...", "data": {...}, "ts": "..." }`.
- Event types: `notification`, `move.created`, `move.updated`, `move.ended`,
  `participant.changed`, `proximity.prompt`, `suggestion.created`, `moment.added`,
  `moment.approval_needed`, `rating.prompt`.
- Client (`lib/realtime.ts`): reconnect with backoff; on reconnect refetch
  notifications and nearby Moves. `lib/notify.ts` shows an in-app banner for
  `notification` events and, when the app is backgrounded, schedules an immediate
  local notification through `expo-notifications` so it appears on the lock screen.
- Every notification is also stored in `notifications` and listed in the
  Notifications tab, so a missed socket event is never lost.

### 9.2 Notify pipeline (`services/notify.py`)

On Move creation (and on second-order joins):

```text
candidates = move_audience
           − participants
           − co-present cluster (section 8.3)        ← FOMO rule
           − users in quiet hours / category muted
           − users already notified for this Move
features   = affinity features per candidate (section 10.1)
picked     = Muse notify picker (section 10.3) → [{user_id, copy, reason}]
             (creator's manual adds are forced in; manual removes forced out)
send       = store notification, publish over WebSocket
```

- **Personal copy**, always first-name and specific: "Hey Anish, Tony's getting matcha
  at Kumo rn. Maya's already there." Muse writes one line per recipient using what it
  knows (who is there that they like, how often they go).
- Cap: Muse picks at most `min(8, ceil(audience/2))` people. Notification fatigue
  kills the loop, so fewer and better is the rule.
- The notification deep-links to `move/[id]` with **I'm going** one tap away.

### 9.3 Notification types

| type | example |
| --- | --- |
| `move_nudge` | "Hey Anish, Tony's doing this: matcha at Kumo." |
| `friend_pulling_up` | "Priya's pulling up to Tony's Move." |
| `joined_your_move` | "Maya is on the way." |
| `proximity_added` | "Added you to Anish's Move · Undo" |
| `muse_flare` | "You saved Kumo Matcha. You're free til 3 and it's 10 min away. Send a flare to Anish + Priya?" |
| `muse_free_time` | "You've got 40 min and Tony's free too. Want to start a Move?" |
| `muse_revive` | "You, Maya and Dev used to hit the climbing gym on Thursdays. Get everyone back together?" |
| `rate_move` | "How was Kumo with Tony and Maya?" |
| `moment_approval` | "Maya tagged you in a moment. OK to share?" |
| `muse_nobody_bit` | "Quiet one. Jordan + 3 are playing pickleball 5 min away and it's open. Pull up?" |
| `muse_route` | "You and Dev are both heading to Kumo from campus. Go together?" |

### 9.4 Share a Move with people outside the app

For friends who aren't in the group or don't have the app. This is the cold-start
loop from mentor feedback: a shared link pulls in people who aren't on Facebook yet.

- **No SMS service.** The app asks the backend for a link, then opens the phone's
  share sheet (React Native `Share`) with the line and the link. The text goes out
  from the user's own number (iMessage, WhatsApp, anything), so there is no sending
  number to register and nothing to pay for.
- **Copy**: "Anish is making a move to the library. You want to pull up?" then the
  link on its own line, which iMessage shows as a second bubble with a preview card.
  Sharing someone else's Move: "Anish: Tony is making a move to ...". The client may
  send Muse's own line as `message`.
- **Who can share**: anyone who can see a live Move (creator, participant,
  audience). Each share makes a row in `move_invites` with its own token, so the
  sharer sees opens and who's coming. No phone numbers are stored.
- **The page** (`app/api/invite_page.py`, mounted at the site root): no login, like
  a Luma link. Place, what's happening, first names of who's there, Apple/Google Maps
  links, and an "I'm pulling up" form that takes only a first name. Open Graph tags
  build the preview card; preview fetchers aren't counted as opens. Stops showing
  details when the Move ends; `noindex`.
- **Guest going**: the sharer and the creator get a `joined_your_move` notification
  through the normal pipeline (9.1, in-app). Guests are not users.
- **Public URL**: set `PUBLIC_BASE_URL` (tunnel or subdomain) so links open off the
  venue Wi-Fi and the preview card can be built.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/moves/{id}/invites` | `{message?}` → `{url, text, body}`; `body` is what the share sheet sends |
| GET | `/moves/{id}/invites` | creator sees all, others their own: opens, guest names |
| GET | `/m/{token}` | public page (site root, not `/api/v1`) |
| POST | `/m/{token}/going` | form post `name` → 303 back to the page |

---

## 10. Muse

Muse is the reason the right people show up. The design principle: **Python computes
facts, Muse makes judgments and writes words.** We never ask Muse to do arithmetic over
raw history, and we never hardcode who gets notified.

### 10.1 Signals computed in Python (`domain/affinity.py`, `muse/context.py`)

For a user U and candidate C:

- `hangouts_30d`, `hangouts_90d`, `last_hangout_days`
- `same_category_hangouts` for the Move's category
- `same_slot_hangouts`: matching weekday type and hour bucket (morning, lunch, afternoon, evening, late)
- `same_mark_visits`
- `pull_up_rate`: of C's notifications from U, how many led to a join
- `shared_circles`, `is_close_friend` (top quintile by hangouts)
- `currently`: free / busy per mock calendar if C opted in, `distance_bucket` (walkable / short drive / far) from C's coarse last-known area if opted in, else unknown

`affinity = 3·log(1+hangouts_30d) + 1.5·log(1+hangouts_90d) + 2·same_category + 1.5·same_slot + 4·pull_up_rate − 0.05·last_hangout_days` (tunable; also the fallback ranker).

`muse/context.py` renders these as compact rows, at most 25 candidates per call, with
short aliases (`u1`, `u2`) instead of names and IDs to save tokens. Names are restored
after parsing.

### 10.2 Agent runner (`muse/runner.py`)

Every agent is a function `(typed input) → typed output` that goes through one runner:

```python
async def run_agent(agent: str, user_id: str, prompt: str, schema: type[T],
                    fallback: Callable[[], T], *, images=None, max_tokens=400) -> T
```

1. Call `MuseClient.complete(system, prompt, images, json=True, max_tokens)`.
2. Extract the JSON object, validate against the Pydantic `schema`.
3. On timeout (6 s), transport error, or invalid JSON: retry once, then return `fallback()`.
4. Write a `muse_runs` row either way (tokens, latency, `used_fallback`).
5. Cache by `prompt_hash` for 60 s to absorb retries and double taps.

`FakeMuseClient` returns canned outputs for tests and for `DEMO_MODE=offline`.

Each agent returns **reasoning chips**: 1 to 3 short factual strings shown in the UI
("free 2:10–3:00", "10 min away", "you + Anish went to 4 matcha spots last month"). They
make Muse's work visible to judges and make the app honest with users.

### 10.3 Notify picker (P0) — `agents/notify_picker.py`

- **When**: Move creation, second-order joins, composer preview (`POST /muse/notify-preview`).
- **Input**: Move (text, category, Mark, time), creator, candidate rows from 10.1, who is already there, cap N.
- **Output**: `{ "picks": [{ "user": "u3", "copy": "...", "reason": "..." }], "skipped_note": "..." }`
- **Prompt rules**: prefer people who actually hang out with the creator at this kind of
  thing and time; include one "stretch" pick from a wider Circle when signals support it
  (this is how HS friends get pulled in); never pick someone marked busy; copy is one
  sentence, starts with "Hey {first_name}", names a mutual who is already there if any.
- **Fallback**: top N by `affinity`, templated copy.

### 10.4 Move writer and place resolver (P0/P1) — `agents/move_writer.py`, `agents/place_resolver.py`

- **Move writer**. Input: Mark, time of day, user taste profile, optional seed text
  (Reel caption, voice utterance). Output:
  `{ "text": "getting matcha, who's down?", "category": "coffee", "alternates": [..3] }`.
  Voice: lowercase, casual, under 60 characters, sounds like a text to friends.
- **Place resolver**. Input: any of geotag, caption, a video frame,
  coarse location, plus the 10 nearest candidate Marks. Output:
  `{ "mark_id": "..." | null, "new_mark": {name, category, vibe_tags} | null, "confidence": 0–1 }`.
  Used by Reels and saved Reels. If `confidence < 0.6`, the UI asks
  "Is this Kumo Matcha?".

### 10.5 Move ranker (P0) — `agents/move_ranker.py`

- **When**: `GET /moves/nearby` (cached per user for 45 s) and the Home feed insert.
- **Input**: up to 15 visible active Moves, each with participants and the user's
  affinity to each participant, category match with the user's taste profile, distance
  bucket, and fill deadline.
- **Output**: `{ "ranked": [{ "move": "m2", "reason": "Tony + Priya · your usual lunch crew" }] }`
- **Rules**: favor the people the user clicks with most, then taste fit, then closeness
  and urgency. The reason line is shown on the "For you" strip.
- **Fallback**: sort by max participant affinity.

### 10.6 Calendar flare and free-time agents (P1) — `agents/flare.py`

This is the autonomous-agent story. A scheduler job runs every 60 s (and on demand from
Demo Control) for users with `muse_proactive` on:

1. Find the user's current **free window** from `calendar_events` (or the device
   calendar via `expo-calendar`, sent as busy blocks only: start/end, no titles). Need
   at least 20 minutes.
2. Gather options: Saved Marks (and saved Reels with a resolved Mark) reachable in the
   window, with `flared_at` older than 3 days; active Moves nearby; pseudo-group
   members who are also free.
3. Ask Muse: is this a good moment, and for what? Output:

```json
{
  "act": true,
  "type": "flare",
  "mark": "k1",
  "invite": ["u2", "u5"],
  "fill_minutes": 10,
  "text": "matcha before class, who's in?",
  "message": "You saved Kumo Matcha. You're free til 3 and it's 10 min away. Send a flare to Anish + Priya?",
  "chips": ["free 2:10–3:00", "10 min away", "you + Anish went to 4 matcha spots last month"]
}
```

4. If `act`, store a `suggestions` row and send a `muse_flare` or `muse_free_time`
   notification. **Tapping yes** calls `POST /suggestions/{id}/accept`, which creates
   the Move (`kind: flare`, `fill_deadline` set) and runs the notify pipeline with
   Muse's invite list.

Rules: windows under 60 minutes get a 5 to 10 minute fill window ("beyond that you
don't have time to even connect"); at most 2 proactive suggestions per user per day;
never during quiet hours; a dismissed suggestion suppresses that Mark for a week.

Travel time is a straight-line estimate at walking or driving speed. No routing API.

### 10.7 Taste learning (P1) — `agents/taste.py`

After ratings come in for a Move, Muse updates `taste_profiles` for each rater and for
the pseudo-group that attended. Input: previous summary, the new ratings with vibe tags
and notes, the Mark's attributes. Output: `{ summary, likes[], dislikes[] }`. The
profile distinguishes at the level users care about ("coffee shops" versus "aesthetic
coffee shops with seating"). Profiles feed the Move writer, the ranker, the flare
agent, and **spot suggestions**: `POST /muse/suggest-spots` returns 3 Marks for a group
with a reason each ("you all rated Kumo 9.1; this is the same vibe, 5 min closer").

### 10.8 Pseudo-groups and revive (P1) — `agents/revive.py`

- **Pseudo-group detection** (Python, nightly and on Demo Control): cluster `hangouts`
  into recurring sets of 2 to 6 people with a shared pattern (category, weekday type,
  hour bucket, top Marks). Muse names each cluster ("weekday coffee crew").
- **Fading**: a pseudo-group is `fading` when its last hangout is older than 2.5× its
  usual gap (minimum 14 days).
- **Revive**: for the most valuable fading group per user, at most once a week, Muse
  writes: "You, Maya and Dev used to hit Summit Climbing on Thursdays. Want to get
  everyone back together?" Accepting opens the composer prefilled with the Mark, the
  members as audience, and a suggested time.
- **Fading groups screen** (in Menu): a list of pseudo-groups with a small sparkline of
  hangouts per week and a "Revive" button. This is the mentor's "history of groups that
  are silently dying".

### 10.9 "Nobody bit" path (P1) — `agents/nobody_bit.py`

Posting a Move and hearing nothing is the same feeling as an unanswered group-chat
message. We cannot make people free, but the user should still have somewhere to go.

- **When**: a flare reaches `fill_deadline` with no joiners, or a regular Move has no
  joiners 15 minutes after posting. Scheduler job; also a Demo Control trigger.
- **Candidates**: live Moves the user is allowed to join right now: Moves already in
  their audience, plus **open Moves** nearby (section 8.5). A Move that is neither is
  never suggested. This is the main reason open Moves stay in scope.
- **Muse** picks the best one (people affinity first, then taste fit, then distance) and
  writes the message: "Quiet one. Jordan + 3 are playing pickleball 5 min away and
  it's open. Pull up?" Output: `{ act, move, message, chips }`.
- Accepting joins that Move and ends the user's own empty one. If there are no
  candidates, Muse sends nothing; the Move just stays up until it ends. No "nobody
  came" message, ever.
- **Fallback**: nearest joinable Move in a category the user likes.

### 10.10 Route and ride suggestions (P2) — `agents/route.py`

A mentor idea the team wants in. Keep it one notification and one tap.

When two audience members are both `going` to the same Move and start from the same
coarse area but are not walkable to the Mark, suggest: "You and Dev are both heading to
Kumo from campus. Go together?" Accepting opens a prefilled message. No ride booking.

### 10.11 Intent parser

- **Intent parser** (`agents/intent.py`, P2): turns a spoken command into
  `{ intent: start_move | none, text, audience_hint: "usual crew" | names }`.

### 10.12 Cost and latency guardrails

- Hard caps: `max_tokens` per agent (notify 500, ranker 400, writer 150, flare 350, taste 300).
- Candidate lists truncated before the call (25 people, 15 Moves, 10 Marks).
- User-facing calls (compose, rank) must return in under 2 s perceived: show the
  heuristic result immediately and swap in Muse's result when it lands.
- `GET /demo/muse-stats` shows calls, tokens, fallback rate. Watch it during testing.

---

## 11. Mocked Facebook surfaces

### 11.1 Reel → "Start a Move here" (P1)

- `(tabs)/reels.tsx`: vertical pager of 3 to 4 seeded clips (`expo-video`, bundled or
  hosted short clips; a looping image with Ken Burns motion is an acceptable stand-in).
- Each Reel with a resolved place shows a **chip**: "📍 Kumo Matcha · 1.2 mi".
- `GET /reels/{id}/place` returns:

```json
{ "mark": {...}, "distance_mi": 1.2,
  "active_move": { "id": "...", "summary": "Tony + 2 friends are here rn" } | null,
  "draft": { "text": "getting matcha, who's down?", "notify": [...], "chips": [...] } }
```

- Tapping the chip opens a bottom sheet with one of two states:
  - **Friends there**: "Tony + 2 friends are here rn" → **I'm going**.
  - **Nobody there**: **Start a Move here** → composer prefilled with place, Muse text, and Muse's notify list.
- Place resolution runs once per Reel through the place resolver (geotag, caption, or a
  frame) and is stored in `resolved_mark_id`.
- Seed: hardcode one Reel whose Mark has an active Move by a friend, so both paths demo.
- Save button on a Reel → `POST /reels/{id}/save` → creates a Saved Mark (`source: reel`).

### 11.2 Saved Reel → Muse calendar flare (P1)

- `saved.tsx`: Saved tab with Reel thumbnails; each also appears as a bookmark pin on the map.
- The flare agent (section 10.6) connects saved place + calendar gap + distance + pseudo-group.
- Demo: mock calendar has one obvious 45-minute gap before a 3:00 class. Demo Control
  "Fire flare scan" runs the job for the current user. The notification arrives, tap
  yes, the Move goes out with a 10-minute fill timer, and the second phone gets the nudge.
- Show the **reasoning card** with the chips on the suggestion screen.

### 11.3 Marketplace (pitch line only, not built)

The kickoff called Marketplace a surprise killer use case for Muse, so mention it, but
build nothing: "The same Move card works for a Marketplace pickup: 'grabbing a desk in
Plano, need a hand?' goes to the friends Muse knows are nearby." One sentence in the
close of the demo.

### 11.4 Meta glasses: "Hey Meta, start a Move" (P2)

One command only. It fits the idea exactly: you post what you are already doing and the
phone never comes out.

- Flow: "Hey Meta, start a Move, getting boba, ask the usual crew" →
  `POST /glasses/command` `{utterance, lat?, lng?}` → the server runs the intent
  parser, resolves the place from coarse location (nearest Marks), maps "the usual
  crew" to the best-matching pseudo-group, runs the Move writer and notify picker, and
  returns a draft with a spoken confirmation line ("Starting a Move at Fat Straws,
  nudging Anish, Priya and Tony. Say confirm."). `POST /glasses/confirm` posts it.
- **Getting audio in**, in order of preference:
  1. Real Ray-Ban Meta glasses paired to the phone as a Bluetooth headset: the app's
     speech recognition (`expo-speech-recognition`) hears the glasses microphone, and
     the confirmation is spoken back through the glasses speakers with `expo-speech`.
     No Meta SDK needed. Trigger is a button or a wake phrase we listen for in-app;
     the real "Hey Meta" wake word belongs to Meta AI and we cannot hook it.
  2. Same screen with the phone's own microphone if no glasses are available.
- `glasses.tsx` is a minimal voice screen: listening indicator, transcript, the draft
  card, confirm. Everything behind it is the same compose pipeline as section 7.2.

---

## 12. Privacy and trust

Implement these as code, not as copy.

### 12.1 Enforcement points

- **`domain/privacy.py::can_see(viewer, move)`** is the only visibility check. True iff
  the viewer is the creator, a participant, or in `move_audience`, and is not blocked by
  the creator. Every Move-returning repository query joins through `move_audience`;
  there is no "list all Moves" query outside `/demo`.
- **Response schemas never contain user coordinates.** `MoveRead` has the Mark's
  coordinates only. There is no `lat/lng` field on any user schema. A test asserts this.
- **Coarse location**: the client rounds to 3 decimals before sending `lat/lng` to
  `/moves/nearby` or `/muse/compose-move`. The server does not persist them; it stores
  only a coarse `last_area` label for users with `location_opt_in`, and clears it when
  they opt out. `/moves/nearby` and `/marks/nearby` both rewrite it through
  `UserService.record_near_area`. The demo interprets "area" as the single region
  `UT Dallas`, the bounding envelope of the seeded Marks (`backend/app/core/areas.py`);
  a point outside it stores no label, never a false one. Search and manual arrival
  need no location. Access logs redact the query string of the two nearby paths.
- **Calendar**: only busy blocks (start, end) reach the server. No titles from a real calendar.
- **Muse prompts** use aliases and first names only, and include only the fields listed
  in section 10.1. No raw coordinates, no addresses of users, no calendar titles.

### 12.2 Screens

- **Onboarding** (after login, three cards): what a Move shows (a place, not you),
  choose your Circles, then separate opt-ins for Location, Bluetooth, Calendar, and
  Muse suggestions, each with a one-line reason and a "Not now" that works.
- **`privacy.tsx`**: all toggles from `user_settings`; "Hidden from" list (blocks);
  auto-join list; ghost visibility; categories of Moves to hear about;
  quiet hours; "Clear my history" (deletes hangouts-derived data for the user).
- **AudienceLine** on the composer and on your own Move cards (section 7.2).
- **Circles** management: create, rename, add/remove members.

### 12.3 Verification

- `fb_verified` is seeded true for demo users and shown as a blue check.
- Unverified users cannot post open Moves, cannot discover open Moves, and are never
  picked as Muse "stretch" notifications.
- In the real product this is Facebook account verification; the demo labels it
  "Verified with Facebook".

### 12.4 Positioning

Not dating. The copy stays about doing things ("pull up", "who's down"), profiles show
no relationship fields, and open Moves show groups and activities rather than
individuals to browse.

### 12.5 End-of-build privacy pass

Run after M4, before demo hardening. Until then, build the rules as written and keep
moving. The pass checks every rule in section 1.5 against the running app and settles:

- **Who sees avatars at a venue.** Today: the Move's audience sees `there` avatars at
  the Mark. Option raised by the team: only people who are themselves at the venue (or
  in the Move) see who is there; everyone else sees a count. Decide in the pass.
- Open Moves: exactly what a nearby non-friend sees (first names and verified badge
  today).
- Ghost lifetime and who sees ghosts.
- That no response schema carries user coordinates and the section 17.3 privacy tests pass.

---

## 13. Ratings and leaderboards

Modeled on Beli: you don't give abstract scores, you rank by comparison, and the app
derives a 0–10 score.

### 13.1 Rating flow (`move/[id]/rate.tsx`)

Triggered by `rating.prompt` when a Move ends. Three quick steps, skippable:

1. "How was it?" → three faces: **Loved it / Fine / Not for us** (maps to stars 5/3/1).
2. One or two **pairwise questions** against Marks already in the user's ranked list
   for that category: "Kumo Matcha or Fat Straws?"
3. Vibe tag chips (aesthetic, quiet, loud, cheap, good seating, fast, worth the drive)
   and an optional note.

`POST /moves/{id}/rating`. The server updates `mark_rankings` and scores, then triggers
the taste agent (section 10.7).

**Ranking algorithm: the team has its own pairwise ranking algorithm and will supply
it.** Until it lands, `domain/ranking.py` exposes this interface with a placeholder
(binary insertion into the ordered list; score evenly spaced within the band set by the
face, e.g. Loved 7.0–10.0). Build everything else against the interface only:

```python
def next_comparison(ranked: list[str], new_mark: str, answers: list[Comparison]) -> str | None
def apply(ranked: list[str], new_mark: str, face: Face, answers: list[Comparison]) -> list[tuple[str, float]]
```

### 13.2 Leaderboards (`leaderboards.tsx`)

| Board | What it ranks |
| --- | --- |
| **Top spots** | Marks by average score among you and your friends, filter by category. Shows "your score / friends' score". |
| **Your list** | Your personal ranked list per category, Beli-style. |

Mark detail shows the score badge, number of Moves there, and who ranked it highest.
Both boards are computed on read from `mark_rankings`; no leaderboard tables. Boards only ever include friends, so they leak nothing beyond
existing audiences.

---

## 14. API contract

Base path `/api/v1`. Every request carries `X-User-Id`. Errors: `{ "detail": "..." }`.
Timestamps are UTC ISO strings; the client converts to local time.

### 14.1 Core schemas (mirror in `frontend/lib/types.ts`)

```ts
type UserLite = { id: string; name: string; first_name: string; avatar_url: string;
                  avatar_color: string; fb_verified: boolean };

type Category = 'food'|'coffee'|'study'|'fitness'|'nightlife'|'outdoors'|'games'
              |'shopping'|'errand'|'other';

type Mark = { id: string; name: string; category: Category; lat: number; lng: number;
              address: string; photo_url?: string; vibe_tags: string[];
              saved: boolean; score?: number; friends_score?: number };

type Participant = { user: UserLite; status: 'going'|'there'|'left';
                     joined_via: 'creator'|'tap'|'ble_prompt'|'ble_auto'|'open_ble' };

type Move = { id: string; creator: UserLite; mark: Mark; text: string; category: Category;
              status: 'live'|'ended'|'cancelled'; kind: 'move'|'flare';
              open: boolean; starts_at: string; fill_deadline?: string; ends_at?: string;
              participants: Participant[]; my_status?: 'going'|'there'|'left';
              moments_count: number; muse_reason?: string;
              audience?: AudienceSummary /* creator only */ };

type AudienceSummary = { count: number; circles: {id: string; name: string}[];
                         people: UserLite[] };

type NotifyPick = { user: UserLite; copy: string; reason: string };

type Suggestion = { id: string; type: string; message: string; chips: string[];
                    draft?: MoveDraft; status: string; expires_at: string };

type MoveDraft = { mark: Mark; text: string; category: Category;
                   circle_ids: string[]; user_ids: string[]; notify: NotifyPick[];
                   fill_minutes?: number; kind: 'move'|'flare' };

type Notification = { id: string; type: string; title: string; body: string;
                      data: Record<string, string>; read_at?: string; created_at: string };
```

### 14.2 Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | liveness |
| GET | `/auth/users` | seeded users for the login picker |
| GET | `/me` | current user + settings |
| PATCH | `/me/settings` | update `user_settings` |
| GET | `/friends` | friend list with affinity tier |
| GET/POST | `/circles` | list / create |
| PATCH/DELETE | `/circles/{id}` | rename, set members / delete |
| GET/POST/DELETE | `/me/blocks` | hidden-from list |
| GET/PUT | `/me/autojoin` | auto-join list |
| GET | `/marks/nearby?lat&lng&radius_km` | Marks with saved/ghost info |
| GET | `/marks/search?q` | name search |
| POST | `/marks` | create a Mark |
| GET | `/marks/{id}` | detail: scores, ghosts, recent Moments |
| POST/DELETE | `/marks/{id}/save` | Saved Marks |
| GET | `/me/saved` | Saved Marks and saved Reels |
| POST | `/audience/preview` | `{circle_ids, user_ids}` → `AudienceSummary` |
| POST | `/muse/compose-move` | `{lat?, lng?, mark_id?, seed_text?}` → `MoveDraft` |
| POST | `/muse/notify-preview` | `{mark_id, text, circle_ids, user_ids}` → `NotifyPick[]` |
| POST | `/muse/suggest-spots` | `{user_ids, category?}` → Marks with reasons |
| POST | `/moves` | create (body: `mark_id`, text/category/audience fields from `MoveDraft`, plus `open`, `origin`, `notify_user_ids`; do not send a nested Mark) |
| GET | `/moves/nearby?lat&lng&radius_km` | visible live Moves, Muse-ranked |
| GET | `/moves/feed` | Move cards for the Home feed |
| GET | `/moves/{id}` | detail |
| POST | `/moves/{id}/join` | I'm going |
| POST | `/moves/{id}/arrive` | status → there |
| POST | `/moves/{id}/leave` | status → left |
| POST | `/moves/{id}/end` | creator ends |
| GET/POST | `/moves/{id}/moments` | list / upload (multipart: file, caption, repeated `tagged_user_ids`) |
| POST | `/moments/{id}/approve` | `{approve: bool}` |
| POST | `/moves/{id}/rating` | submit rating + pairwise answers |
| GET | `/moves/{id}/rating/questions` | pairwise questions for this user |
| GET | `/leaderboards/spots?category` | Top spots |
| GET | `/leaderboards/my-list?category` | personal ranked list |
| GET | `/notifications` | list |
| POST | `/notifications/read` | mark read |
| GET | `/suggestions` | pending Muse suggestions |
| POST | `/suggestions/{id}/accept` | creates the Move (optional edited draft) |
| POST | `/suggestions/{id}/dismiss` | |
| GET | `/pseudo-groups` | with fading flag and history |
| POST | `/pseudo-groups/{id}/revive` | → `MoveDraft` |
| POST | `/proximity/token` | rotating BLE token |
| POST | `/proximity/sightings` | batch sightings |
| POST | `/proximity/prompt/{move_id}/accept` | join via prompt; body `{always: bool}` |
| GET | `/calendar` | mock events / free window |
| PUT | `/calendar/busy` | device busy blocks |
| GET | `/reels` | mock feed |
| GET | `/reels/{id}/place` | chip + sheet data |
| POST/DELETE | `/reels/{id}/save` | save Reel → Saved Mark |
| POST | `/glasses/command` | `{utterance, lat?, lng?}` → draft + spoken confirmation |
| POST | `/glasses/confirm` | post the drafted Move |
| WS | `/ws?user_id` | events (section 9.1) |
| * | `/demo/*` | section 15.2 |

Uploaded and seeded Moment media is served through authenticated `/media/{filename}` handlers over `backend/data/uploads`, with `X-User-Id` and the same visibility checks as Moments. The legacy `/api/v1/media/{filename}` URL remains supported. Never publicly mount the private uploads directory. Mark seed images use a separate public allowlisted `/media/seed/marks/{asset_name}` route.

---

## 15. Seed data and demo control

### 15.1 Seed world (`backend/app/seed/seed.py`)

`uv run python -m app.seed.seed` drops and rebuilds `app.db`. It must produce a world
where every Muse feature has real signal to reason about:

- **Area**: one campus-sized area (default: around UT Dallas / Richardson–Plano; change
  the center constant to the demo venue if needed). 30 to 40 Marks across all
  categories with real-sounding names and vibe tags, including "Kumo Matcha".
- **Users**: 12 to 15. The demo cast with clear roles: **Anish** (main demo phone),
  **Tony**, **Maya**, **Priya**, **Dev**, **Dhivyesh**, **Jordan** (not Anish's friend; hosts the open Move),
  plus HS-friends and one parent ("Mom", a friend who is in no Circle and on the
  hidden-from list, to show the privacy story).
- **Circles** for Anish: Roommates, Climbing (tagged as a Facebook Group), HS friends,
  Study group.
- **History**: 8 weeks of ended Moves generating `hangouts` with deliberate patterns:
  - Anish + Priya (+ Tony): matcha/coffee on weekday afternoons, 4 matcha spots last month.
  - Anish + Tony + Maya: lunch at Chipotle-type spots.
  - Anish + Maya + Dev: climbing on Thursdays, **stopped 4 weeks ago** (the fading group).
  - HS friends: one hangout 6 weeks ago (the "stretch" pick).
- **Ratings and rankings** so leaderboards are populated and the taste profile says
  "aesthetic coffee shops".
- **Live state**: one active Move by Tony at Kumo Matcha with 2 others (for the Reel
  "friends there" path); one **open** pickleball Move by Jordan + 3 nearby (for the
  "nobody bit" path); ghosts with seeded Moments at another Mark from last night.
- **Reels**: 4 clips; one geotagged at Kumo (friends there), one at a Mark with nobody
  (start new), one with no geotag where the caption names the place (resolver demo).
- **Calendar** for Anish: classes with a 2:10–3:00 gap; Anish's saved Reel of Kumo saved "3 days ago".

### 15.2 Demo Control (`demo.tsx`, `/demo/*`, only when `DEMO_MODE` is set)

| Control | Endpoint | Effect |
| --- | --- | --- |
| Reset world | `POST /demo/reset` | re-run the seed |
| Set demo time | `POST /demo/time` `{iso}` or `{offset_minutes}` | shifts `core/clock.py`; all "now" reads go through the Clock |
| Fire flare scan | `POST /demo/flare-scan` | runs section 10.6 for the current user now |
| Fire free-time prompt | `POST /demo/free-time` | "Want to start a Move?" |
| Fire revive scan | `POST /demo/revive-scan` | runs section 10.8 |
| Simulate co-presence | `POST /demo/copresence` `{user_ids, on}` | injects `source: sim` sightings |
| Friend posts a Move | `POST /demo/friend-move` `{user_id, mark_id, text}` | a seeded friend posts; notify pipeline runs |
| Friend pulls up | `POST /demo/friend-join` `{user_id, move_id}` | |
| End Move | `POST /demo/end-move` `{move_id}` | triggers ghosts + rating prompt |
| Nobody bit | `POST /demo/nobody-bit` `{move_id}` | expires the fill window with no joiners; section 10.9 runs |
| Route suggestion | `POST /demo/route` `{move_id, user_ids}` | section 10.10 |
| Muse stats | `GET /demo/muse-stats` | calls, tokens, fallback rate, last outputs |

**All time reads in the backend go through `core/clock.py`.** Never call
`datetime.now()` directly in services; the demo depends on shifting time.

### 15.3 Demo script (target 4 minutes)

1. **Hook** (20 s). Open the mock Facebook app as Anish. "RSVPs are friction. I don't know if I'm free Wednesday. I know I'm free now."
2. **Reel → Move** (40 s). Scroll Reels, tap "📍 Kumo Matcha", see "Tony + 2 friends are here rn", tap I'm going. Second phone (Priya) gets "Hey Priya, Anish is pulling up to Tony's Move".
3. **Map and ghosts** (30 s). Moves tab: category Marks, avatar stacks, "For you" with Muse's reasons. Tap a ghost from last night, see the Moments. FOMO.
4. **Share a Move + proximity** (45 s). Post "study with me" from the composer; show the audience line and Muse's notify list with reasons. The phone next to it gets "You're with Anish. Add yourself?" and the far phone gets the FOMO nudge.
5. **Muse acts on its own** (45 s). Fire the flare scan: "You saved Kumo Matcha. You're free til 3 and it's 10 min away. Send a flare to Anish + Priya?" Show the reasoning card, tap yes, 10-minute fill timer.
6. **After the Move** (30 s). End it, rate with one pairwise question, show the leaderboard and the updated taste line. Then the revive card for the climbing crew.
7. **Nobody bit** (20 s). A flare expires empty; Muse offers Jordan's open pickleball Move. "There's always somewhere to go."
8. **Trust** (20 s). Privacy screen: place not person, opt-ins, audience line, hidden-from Mom.
9. **Close** (20 s). "Hey Meta, start a Move" on the glasses if it works, the Marketplace line, then the growth loop.

Record a backup video of the full flow once it works.

---

## 16. Frontend architecture notes

- **State**: server state in TanStack Query (keys: `['moves','nearby']`, `['move',id]`,
  `['notifications']`, `['suggestions']`, ...). Realtime events patch or invalidate
  these keys in one place (`lib/realtime.ts`). Local UI state in component state;
  session and settings in a small zustand store persisted to AsyncStorage.
- **Optimistic actions**: join/leave/save update the cache immediately and roll back on error.
- **`lib/backend.ts`**: port the existing `backend.js` helper to TypeScript and add the
  `X-User-Id` header from the session. Keep the LAN auto-discovery and
  `EXPO_PUBLIC_BACKEND_URL` override. WebSocket URL derives from the same base.
- **Deep links**: scheme `hackmeta26://`. Notifications carry `data.route`
  (`/move/abc`, `/suggestion/xyz`) and the banner/local-notification handler calls
  `router.push`.
- **Permissions**: request each one in context (location on first map open, BLE and
  calendar from onboarding or privacy), and every feature has a no-permission path.
- **Config flags** (`EXPO_PUBLIC_*`): `BACKEND_URL`, `PROXIMITY=ble|sim`, `DEMO=1`
  (shows Demo Control in Menu).
- **Look**: Facebook-like neutrals and blue for chrome; the Moves surface gets its own
  accent and the category colors. Motion: spring the pin avatar stacks on
  `participant.changed`, haptic on I'm going, count-down ring on flare timers.
- `app.json`: add iOS usage strings (location when-in-use, Bluetooth, calendar, camera,
  microphone, speech recognition), the plugins for the native modules, and the
  expo-router entry.

---

## 17. Workstreams

Five lanes with file ownership so agents and teammates do not collide. The contract in
section 14 is the boundary: frontend lanes build against `FakeMuseClient` and the seed
from the first hour.

| Lane | Owns | Delivers |
| --- | --- | --- |
| **A. Backend core** | `core/`, `tables.py`, `models.py`, `domain/`, `repositories/`, `services/{moves,marks,circles,moments}.py`, `api/routes/{auth,users,circles,marks,moves,moments,ws}.py`, `realtime/`, `seed/` | DB, seed, Move lifecycle, privacy enforcement, WebSocket hub |
| **B. Muse** | `muse/**`, `services/notify.py`, `api/routes/{muse,notifications}.py`, `scheduler/`, suggestions, pseudo-groups, taste | Muse client, runner, all agents with fallbacks, notify pipeline, flare/revive/nobody-bit jobs |
| **C. App shell + map** | `frontend/app/(tabs)/**`, `app/_layout.tsx`, `app/login.tsx`, `components/{fb,map,ui}`, `lib/{backend,api,types,realtime,session,notify,theme}.ts` | Mock Facebook shell, map, pins, Move sheet, notifications, banners |
| **D. Move flows** | `frontend/app/move/**`, `app/mark/**`, `app/{saved,leaderboards,privacy}.tsx`, `app/circles/**`, `components/{move,muse}`, `lib/geofence.ts`; backend `services/{ratings,leaderboards}.py` + routes | Composer, detail, moments, ghosts, rating, leaderboards, privacy screens |
| **E. Surfaces + proximity** | `frontend/app/{reels tab content,glasses,demo}.tsx`, `lib/proximity/**`, `lib/calendar.ts`; backend `services/{proximity,reels,calendar,glasses}.py` + routes, `api/routes/demo.py` | Reels chip, saved-Reel flare surface, real BLE + sim proximity, open Moves, glasses voice, Demo Control |

### 17.1 Build order

| Milestone | Done means |
| --- | --- |
| **M0 Foundations** | Muse API verified with one real call. DB + seed run. expo-router shell with tabs and login picker. Typed API client. WebSocket connects. |
| **M1 Core loop** | Map shows seeded Moves with category pins. Post a Move from the composer with audience line. Second phone gets a realtime notification written by Muse and can tap I'm going. Arrive/leave works. |
| **M2 Muse is essential** | Notify picker, Move writer, ranker live with reasons shown. Flare scan from Demo Control produces a suggestion that becomes a Move. |
| **M3 FOMO + retention** | Ghosts and Moments. Rating flow with pairwise, taste profile, Top spots. Revive card. Nobody-bit path. |
| **M4 Surfaces** | Reel chip both paths. Saved Reel flare. Proximity prompt and FOMO skip (real BLE if it is working, simulated otherwise). |
| **M5 Stretch** | Open Moves over BLE. "Hey Meta, start a Move". Route suggestion. |
| **Privacy pass** | Section 12.5, after M4. |
| **M6 Demo hardening** | Full script run twice on real phones on venue Wi-Fi. Offline Muse fallback checked. Backup video recorded. |

Freeze new features once M4 is done or by early Friday morning, whichever comes first;
the remaining time goes to M6.

### 17.2 Definition of done for any feature

- Follows section 1.5 as written; `can_see` is the only visibility path. Edge cases go to the privacy pass (12.5), not into the critical path.
- Has a Demo Control trigger if it depends on time, hardware, or another person.
- Works with Muse unavailable (fallback) and with every permission denied.
- Backend: service-level test for the use case; `uv run pytest && uv run ruff check .` pass.
- Frontend: loading, empty, and error states exist; no red screens on a dropped socket.

### 17.3 Tests that must exist

- Privacy: a blocked user and a non-audience friend cannot fetch a Move by id, in
  nearby, in feed, as a ghost, or via Moments.
- No user coordinates in any response schema.
- Notify pipeline excludes participants and the co-present cluster.
- Move state machine transitions and auto-end.
- Each Muse agent: valid output parses; garbage output triggers the fallback.
- Pairwise ranking insertion produces a stable order and scores.

---

## 18. Risks and open questions

| Risk / question | Plan |
| --- | --- |
| Muse API shape, JSON mode, vision support unknown | Verify at M0 (section 3.2). Adapter isolates it. Vision paths fall back to text. |
| $100 token budget | Caps and caching (section 10.12). Develop against `FakeMuseClient`; use real Muse for integration and demo. |
| BLE in React Native (advertising especially) | Real BLE work starts early, in parallel, on two physical phones with a dev build (section 8.2). Simulated proximity stays as the fallback demo path. |
| Venue Wi-Fi blocks phone-to-laptop traffic | Tunnel the backend and set `EXPO_PUBLIC_BACKEND_URL`; or phone hotspot. Test Thursday night. |
| Lock-screen notifications | Local notifications from socket events; in-app banners are the primary path. |
| Live demo flakiness | Demo Control for every timed step, seed reset, offline Muse mode, backup video. |
| "Is the AI essential?" | Lead with features that cannot exist without Muse: who gets notified, the autonomous flare, revive, taste. Show reasoning chips everywhere. |
| Privacy pushback from judges | Section 1.5 rules are visible in the UI: audience line, place-not-person, opt-ins, hidden-from. Privacy pass (12.5) before the demo. |
| Pairwise ranking algorithm | Team supplies it; placeholder behind the `domain/ranking.py` interface until then. |
| Glasses audio path | Try Ray-Ban Meta as a Bluetooth headset early; phone mic is the fallback. |
| App name and final branding | Working name "Spontaneous"; "Moves" is the feature name inside Facebook. Team to confirm. |
| Demo area center | Seed constant; set to wherever the demo phones physically are so distances read correctly. |
| Real Facebook Groups integration | Out of scope; mocked. Circles carry an `fb_group_name` to show the tie-in. |

---

## 19. Answers to have ready for judges

| Question | Our answer |
| --- | --- |
| Why isn't this just a group chat? | In a group chat you have to *send* something: "who's down?", every time, to one fixed set of people. Most people won't. A Move is a share, not an ask, and the nudge is a notification built for exactly this with a one-tap "I'm going". It also reaches people you would never text. |
| What if I post and nobody comes? | Same as a quiet group chat: everyone's busy, and no app can fix that. What we add is the "nobody bit" path: Muse points you to a live Move you can still join. There is always somewhere to go. |
| Is the AI essential? | Who gets nudged, the unprompted flare (saved place + calendar gap + distance + your usual people), reviving fading groups, and taste learning from ratings all come from Muse. Without it, saves never become plans. |
| Is this live location? | No. A Move shows a place you chose to share with people you chose, and it ends when you leave. Location, Bluetooth and calendar are each opt-in. |
| Why Facebook? | Reels is where young adults already see things they want to do. Reel → Move turns watch time into real-world plans, and Circles turn Groups into curated, in-person experiences. |
| Is it a dating app? | No. It is about doing things with people you know; open Moves show groups and activities, not profiles to browse. |
