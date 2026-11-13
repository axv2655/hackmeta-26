# Meta Moves desktop web

The desktop Facebook shell for Moves. It talks to the same backend as the mobile
app (`/api/v1` plus the `/api/v1/ws` socket): log in as a seeded person (their
first name, password `moves`), and Moves, Pull up, posting a Move, Snapshots,
notifications, friends, contacts and Memories are live. The Home feed posts,
Stories, Reels, Marketplace, Groups and Messenger are still demo content.

The page never reads the viewer's location: "near" queries use the fixed campus
point in `src/api.js`.

## Local development

```sh
npm ci
npm run dev        # Vite proxies /api and /media to BACKEND_URL (default http://localhost:8000)
```

Start the backend first (`backend/`: `uv run uvicorn app.main:app --reload`).

## Same-host deployment

From the repository root, `docker compose up -d --build backend` builds the web
client and the API into one container. The existing backend origin now serves:

- `/`: the web app (`/web` redirects here).
- `/assets/*`, `/fb/*`, `/favicon.ico`: the built web assets.
- `/api/v1/*`, including `/api/v1/ws`: the mobile API and socket.
- `/media/*`, `/m/*`, `/mcp`, `/docs`: their existing backend routes.

Use the **same origin as the mobile build's `EXPO_PUBLIC_BACKEND_URL`**. The
teammate's AWS hostname is not checked into this repository; obtain it from that
build's environment or the teammate running the server. No separate web domain,
port or AWS service is required.

The server must pull main and rebuild the container; a Git push alone does not
deploy it. Preserve `backend/.env`, the root deployment `.env`, the `backend-data`
volume and existing secrets. There is no seed/reset step.

The reverse proxy must forward `/` to the existing backend port (default
`127.0.0.1:8000`), including static assets, while retaining its WebSocket handling.
If it currently forwards only `/api`, add the root location to that same upstream.
For a Docker deployment that bypasses Compose, build the repository-root
`Dockerfile` with the repository root as its build context. `backend/Dockerfile`
continues to produce an API-only image.

For a non-Docker host:

```sh
cd frontend/web
npm ci
npm run build
cd ../../backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API discovers `frontend/web/dist` automatically; set `WEB_DIST_DIR` if the
built files live elsewhere. Start/restart the API after building. HTML and public
images are revalidated; Vite's hashed assets are cached. Missing assets and
unknown API URLs return 404 rather than a copy of the homepage.

Verify the deployed origin with `GET /` (HTML), `GET /web` (redirect), and
`GET /api/v1/health` (`{"status":"ok"}`).
