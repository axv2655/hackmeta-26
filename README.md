# hackmeta-26

Hackathon starter: an Expo (React Native) app in `frontend/` and a FastAPI
backend in `backend/`.

- `frontend/` is a bare Expo app that renders "Hello world". It runs on iOS,
  Android and web. `lib/backend.js` is a small fetch helper for the API.
- `backend/` is the layered FastAPI template from hackathon-template. No
  database or secrets needed to run. See [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md).

## Run

Backend (Python 3.12+, [uv](https://docs.astral.sh/uv/)):

```sh
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0
```

API docs at http://localhost:8000/docs. `--host 0.0.0.0` lets a phone on the
same Wi-Fi reach it.

Frontend (Node 20+):

```sh
cd frontend
npm ci
npx expo start        # press i / a / w, or scan the QR code with Expo Go
```

`lib/backend.js` finds the backend on port 8000 of the machine serving the
Expo bundle (e.g. `api.health()`). Set `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env` to point at a
deployed backend instead (see `frontend/.env.example`).

CORS only matters for the web build; `FRONTEND_HOST` in `backend/.env`
defaults to Expo web's `http://localhost:8081`.

## Checks

```sh
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

## Starting a real project

- Rename in `frontend/app.json` (name, slug, scheme, bundle IDs) and
  `backend/pyproject.toml`. Add icons under `frontend/assets/` and reference
  them from `app.json`.
- Delete the backend's notes example when you no longer need it: in
  `backend/app/`: `domain/`, `repositories/`, `services/`,
  `api/routes/notes.py`, `api/errors.py`, plus `backend/tests/test_notes.py`.
  Or keep them as the reference for how to layer a feature.
- `.claude/skills/` carries the design and animation skills from hackrice26.

## Docker (backend)

```sh
docker build -t hackmeta-26-backend backend
docker run --rm -p 8000:8000 hackmeta-26-backend
```
