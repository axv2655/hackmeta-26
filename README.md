# Meta Moves

[![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=white)](frontend/mobile/package.json)
[![Expo](https://img.shields.io/badge/Expo-57-000020?logo=expo&logoColor=white)](frontend/mobile/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](frontend/mobile/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](backend/pyproject.toml)

**Meta Moves turns “I'm already going” into “come join me,” letting friends share what they're doing on Facebook and Pull up without the pressure of a direct invitation.**

Built for the Meta Career Programs AI Hackathon 2026. **Meta Moves** is our
spontaneous activity-sharing feature inside a mocked Facebook experience.

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
