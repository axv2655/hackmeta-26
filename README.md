# Moves

**Moves turns “I'm already going” into “come join me,” letting friends share what they're doing on Facebook and Pull up without the pressure of a direct invitation.**

Built for the Meta Career Programs AI Hackathon 2026. The project working name is
**Spontaneous**; **Moves** is the feature inside our mocked Facebook experience.

## Why Moves

Getting coffee, studying at the library, going to the gym, or trying somewhere new
doesn't always need a plan. Sometimes you're already going and would enjoy company,
but choosing whom to text and asking them to commit feels like extra work.

Moves makes that everyday invitation easy: share what you're doing with a chosen
audience, and friends can join with one tap. The goal is to give young adults a
reason to use Facebook alongside Instagram, growing Facebook's younger audience
through spontaneous time together. Mobile is the primary experience; web is a
companion for moments when someone already has their laptop open.

Our starting hypothesis is that people who already enjoy checking in on friends
through location sharing may value an explicit invitation to join them. The
prototype shares activities at selected places, never people's live positions.
Audience growth and conversion are hypotheses to validate, not measured results.

## A user story

> As a young adult already heading somewhere, I want to share what I'm doing with
> friends I choose, so they can join me without either of us having to organize a plan.

Maya is heading to a café to study. She posts “studying at Kumo, Pull up” to her
Campus friends Circle. The composer shows who can see it. Muse suggests a few
people to nudge, and Maya confirms whom to notify. Priya taps **Pull up** and
appears as on the way. Once she arrives, the Move shows them together at the café.
Other people in the permitted audience can join too. Their gathering grows within
the Move; joining does not automatically create a Circle or widen its audience.

## How it works

1. Choose a **Mark**, the place pin where your activity happens. Search works
   without location permission.
2. Share a **Move**: what you're doing, plus the Circles or people who can see it.
3. Review Muse's suggested recipients and send a nudge. Visibility and receiving
   a notification are separate choices.
4. Friends tap **Pull up**. The Move distinguishes people on the way from people
   who have arrived.
5. **Moments** and **Ghosts** can preserve the shared experience after it ends,
   subject to audience and approval rules.

| Term | Meaning |
| --- | --- |
| Move | A spontaneous activity someone is doing or about to do. |
| Mark / Saved Mark | A place pin / a place someone saved for later. |
| Pull up | Join a Move. |
| Circle | A user-selected audience group. |
| Flare | A Move with a short window for friends to join. |
| Moment | A photo or clip from a Move; tagged people must approve wider visibility. |
| Ghost | A trace of an earlier visit at a Mark, subject to visibility settings. |
| Pseudo-group | A recurring group inferred from hangout history for suggestions. |
| Open Move | An explicitly opted-in Move discoverable by nearby people through BLE, not a public post. |

## Where Muse adds value

The core AI uses the hackathon's **Muse model API**. The backend already contains
agents for recipient selection, Move ranking, drafting, place resolution, Flare
suggestions, taste learning, group revival, and alternatives when a Move stays
quiet. Their presence does not mean every client flow is integrated; see status below.

The design rule is **Python computes facts; Muse interprets context and proposes
choices.** Permissions, audience membership, calendar overlap, notification caps,
and state transitions remain deterministic. Muse cannot grant visibility or post
a Move on someone's behalf.

The strongest next refinement is to make recommendations sensitive to the meaning
of an activity and people's stated preferences:

| Focus | Example | Why use a model? |
| --- | --- | --- |
| Intent-aware recipient selection | “Quiet study, company welcome” and “coffee and a catch-up” at the same café can suit different friends. | Interpret free text and contextual preferences beyond a place/category match. |
| Taste from feedback | “Loved the drinks, too loud to study” should improve future study suggestions without ruling out the café for social visits. | Extract conditional preferences from natural-language feedback. |
| A timely Flare | Suggest a Saved Mark that fits an opted-in free window, the user's preferences, and available friends; let the user decide. | Compare the meaning and suitability of eligible options after code checks feasibility. |

These are proposed refinements, not claims of demonstrated model superiority.
The current notify picker primarily receives structured social signals; the ranker
uses a simplified taste match. Richer preference context would make the semantic
examples above more convincing. Drafting a caption alone is a supporting convenience.

For judging, demonstrate a pair of Moves at the same place with different intent,
show the supplied evidence and resulting recommendations, and compare Muse with
the existing affinity-based fallback. Use a small set of human-labeled scenarios
to check relevance, unsupported explanations, and audience violations. A later
pilot can measure joins and confirmed arrivals per nudge, plus dismissals and
notification volume. Don't claim uplift before measuring it.

Research on [language-based recommendation with little interaction history](https://research.google/pubs/large-language-models-are-competitive-near-cold-start-recommenders-for-language-and-item-based-preferences/)
supports exploring this direction; it does not establish performance for Moves.

Every agent runs through a shared runner with output validation, fallback behavior,
and a `muse_runs` log. Without Muse configuration, or with `DEMO_MODE=offline`, the
backend uses `FakeMuseClient`. Offline behavior keeps development usable but is
not evidence of a live Muse integration.

## Privacy by design

- Location is opt-in. Choose a place manually when permissions are denied.
- Marks carry place coordinates. Users' live coordinates are not exposed.
- Posts have explicit audiences, shown before posting; blocks restrict access.
- A growing gathering does not make a Move public.
- Proximity-based joining requires a tap unless a person is explicitly on the
  user's auto-join list.
- Muse proposes; the user approves posting a Move or sending a Flare.
- Tagged people approve a Moment before it becomes visible beyond participants.

These are product requirements. The backend includes privacy tests, but this
prototype is not a production Facebook integration. Account endpoints exist;
requests still trust `X-User-Id`, which is demo authentication rather than a
production security boundary.

## Current implementation

Status below is based on source inspection, not an end-to-end device certification.

| Area | Present in the repository | Remaining distinction |
| --- | --- | --- |
| Mobile | Facebook shell, map, composer with audience preview, Muse recipient preview, API-backed Moves and join/leave, WebSocket refresh, local demo fallbacks. | Mixes real API flows with mock content. Offline posts are local-only. Device and multi-user validation still needed. |
| Desktop web | React Facebook shell and Leaflet Moves map with local interactions. | Uses bundled data and component state; no backend API connection in the current `App.jsx`. |
| Core backend | SQLModel persistence, accounts, Moves lifecycle, Marks, Circles, audiences, Moments, invitations, realtime, seed data, and tests. | Demo auth and seeded data remain part of the prototype. |
| Muse backend | Real HTTP adapter, fake client, agent runner, prompts, agents, notification pipeline, scheduler registrations, and tests. | End-to-end behavior also depends on the supporting services being wired and live Muse configuration. |
| Supporting surfaces | Service code and tests for calendar, proximity ingestion, hangout history, ratings/ranking, and leaderboards. | `app/lanes/surfaces.py` registers nothing yet. Calendar, proximity, ratings, Reels, glasses, and Demo Control route files are stubs. |

The architecture describes the target as well as completed work. In particular,
real BLE, a working `/demo/*` panel, and every P1/P2 user journey should not be
presented as complete merely because they appear in the spec.

## Stack and layout

| Layer | Current implementation |
| --- | --- |
| Mobile | Expo SDK 57, React Native 0.86, React 19, TypeScript, expo-router, react-native-maps, zustand, AsyncStorage. |
| Web | Vite, React 19, JavaScript, Leaflet. |
| API | FastAPI, Python 3.12.11+, uv, Pydantic, HTTPX. |
| Database | SQLModel; PostgreSQL via psycopg when `DATABASE_URL` is set, SQLite otherwise. |
| Realtime | Server-push WebSocket at `/api/v1/ws`; REST under `/api/v1`. |
| AI | Muse behind `MuseClient`, with validated outputs and heuristic fallbacks. |

The architecture calls for TanStack Query for server state. The current mobile
implementation uses zustand stores and fetch helpers; TanStack Query is not yet
in its dependency manifest.

```text
frontend/mobile/   Phone app and its API integration
frontend/web/      Desktop web prototype
backend/app/       Domain rules, services, repositories, API, Muse, seeds
backend/tests/     Core, Muse, surfaces, messaging, and contract tests
docs/             Backend task plan and supporting documentation
```

## Run locally

Use separate terminals for the backend and each client. Frontend dependencies are
installed independently in `frontend/mobile/` and `frontend/web/`.

Backend:

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0
```

API docs: <http://localhost:8000/docs>. Startup creates missing tables; populating
the demo world is a separate step. For a disposable development database:

```sh
cd backend
uv run python -m app.seed.seed
```

**Seeding drops and rebuilds the configured database**, including a PostgreSQL
database selected by `DATABASE_URL`. Use it only against data you intend to reset.
Seeded people can sign in with their first name as username and `moves` as password.

Mobile:

```sh
cd frontend/mobile
npm ci
npx expo start
```

For a physical phone, use the same Wi-Fi as the backend. The client discovers
port 8000 on the Expo host; set `EXPO_PUBLIC_BACKEND_URL` in
`frontend/mobile/.env` to override it. Real BLE is a planned dev-build feature;
it is not installed in the current mobile dependency manifest.

Desktop web:

```sh
cd frontend/web
npm ci
npm run dev
```

Vite normally serves <http://localhost:5173>. This is a separate client from Expo
web and currently runs on local demo data.

Backend configuration goes in `backend/.env`; see
[backend/.env.example](backend/.env.example). Relevant settings:

- `DATABASE_URL`: optional PostgreSQL connection string; otherwise `DB_PATH`
  defaults to `backend/data/app.db`.
- `MUSE_BASE_URL`, `MUSE_API_KEY`, `MUSE_MODEL`: enable the live model client.
- `DEMO_MODE=offline`: fake Muse and a shiftable clock. `DEMO_MODE=on`: shiftable
  clock while retaining configured Muse. Neither fills in the stub Demo Control routes.
- `FRONTEND_HOST`: allowed browser origin, default `http://localhost:8081` for
  Expo web. When connecting the Vite client, set its actual origin instead.

Never commit secrets. Public Expo variables are bundled into the client and must
not contain API keys.

## Checks

```sh
cd backend
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

```sh
cd frontend/mobile
npm run typecheck
```

```sh
cd frontend/web
npm run lint
npm run build
```

## Project references

- [Architecture and product rules](ARCHITECTURE.md): source of truth for scope,
  privacy, AI behavior, contracts, and the demo.
- [Backend task plan](docs/BACKEND_TASKS.md): lane ownership and issue breakdown.
- [Backend layering guide](backend/ARCHITECTURE.md): template conventions; some
  introductory descriptions predate the implemented database and features.
- [Surfaces implementation prompts](PROMPTS.md).
- [Contributor instructions](AGENTS.md).
