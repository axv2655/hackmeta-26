# hackmeta-26

Hackathon starter: an Expo (React Native) app in `frontend/mobile/`, a
Vite + React web feed in `frontend/web/`, and a FastAPI
backend in `backend/`.

- `frontend/mobile/` is a bare Expo app that renders "Hello world". It runs on iOS,
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
cd frontend/mobile
npm ci
npx expo start        # press i / a / w, or scan the QR code with Expo Go
```

Web feed UI (Vite + React):

```sh
cd frontend/web
npm ci
npm run dev           # http://localhost:5173
```

`lib/backend.js` finds the backend on port 8000 of the machine serving the
Expo bundle (e.g. `api.health()`). Set `EXPO_PUBLIC_BACKEND_URL` in `frontend/mobile/.env` to point at a
deployed backend instead (see `frontend/mobile/.env.example`).

CORS only matters for the web build; `FRONTEND_HOST` in `backend/.env`
defaults to Expo web's `http://localhost:8081`.

## Moves MCP server (Muse / Meta AI)

The backend serves a remote [MCP](https://modelcontextprotocol.io) server at
`POST /mcp` (Streamable HTTP, stateless, JSON responses; protocol versions
2025-11-25, 2025-06-18 and 2025-03-26) so Muse can draft and post Moves.

Tools: `draft_move` (writes nothing), `confirm_move`, `share_move`, `pull_up`
(all idempotent on `request_id`), `friends_nearby`, `get_my_active_move`. Every
call acts as `MCP_USER_ID` and `confirm_move` should only be called after the
user says yes.

Set in `backend/.env` (never commit it):

```sh
MCP_TOKEN=<long random string>      # e.g. python -c "import secrets; print(secrets.token_urlsafe(32))"
MCP_USER_ID=u_anish                 # the user Muse acts as (default u_anish)
```

With `MCP_TOKEN` unset every `/mcp` request is rejected with 401.

Run it and expose it with a tunnel:

```sh
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
cloudflared tunnel --url http://localhost:8000     # prints https://<name>.trycloudflare.com
```

Register in Muse: URL `https://<name>.trycloudflare.com/mcp`, header
`Authorization: Bearer <MCP_TOKEN>` (or `X-API-Key: <MCP_TOKEN>`).

Test it with the inspector (choose "Streamable HTTP", set the URL above and the
Authorization header):

```sh
npx @modelcontextprotocol/inspector
```

Or from a terminal:

```sh
curl -s http://localhost:8000/mcp   -H "Authorization: Bearer $MCP_TOKEN"   -H "Content-Type: application/json"   -H "Accept: application/json, text/event-stream"   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Checks

```sh
cd backend && uv run pytest && uv run ruff check . && uv run ruff format --check .
```

## Starting a real project

- Rename in `frontend/mobile/app.json` (name, slug, scheme, bundle IDs) and
  `backend/pyproject.toml`. Add icons under `frontend/mobile/assets/` and reference
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
