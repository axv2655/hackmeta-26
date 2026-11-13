# FastAPI backend. Deps come from uv.lock so the image matches local dev.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.8.22 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/venv PATH="/venv/bin:$PATH"

WORKDIR /code
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY app ./app
RUN uv sync --frozen --no-dev

# Media uploads and the SQLite fallback live on a volume (compose mounts /data).
ENV MEDIA_DIR=/data/uploads DB_PATH=/data/app.db
EXPOSE 8000
# Behind NGINX: trust X-Forwarded-* so links and redirects use https.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
