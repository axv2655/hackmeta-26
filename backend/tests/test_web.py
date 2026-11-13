"""The desktop build shares the mobile API origin without swallowing its routes."""

import pytest
from fastapi.testclient import TestClient

from app.core import db
from app.core.config import settings
from app.main import create_app


@pytest.fixture
def web_client(tmp_path, monkeypatch, session):
    (tmp_path / "index.html").write_text("<!doctype html><h1>Meta Moves</h1>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-test.js").write_text("console.log('Moves');")
    (tmp_path / "fb").mkdir()
    (tmp_path / "fb" / "sidebar.webp").write_bytes(b"web-asset")
    monkeypatch.setattr(settings, "WEB_DIST_DIR", str(tmp_path))
    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = lambda: session
    with TestClient(app) as client:
        yield client


def test_web_entry_and_assets(web_client):
    page = web_client.get("/")
    assert page.status_code == 200 and "Meta Moves" in page.text
    assert page.headers["content-type"].startswith("text/html")
    assert page.headers["cache-control"] == "no-cache"
    assert web_client.head("/").status_code == 200
    redirect = web_client.get("/web", follow_redirects=False)
    assert redirect.status_code == 307 and redirect.headers["location"] == "/"
    asset = web_client.get("/assets/index-test.js")
    assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
    assert web_client.get("/fb/sidebar.webp").content == b"web-asset"
    unchanged = web_client.get("/", headers={"If-None-Match": page.headers["etag"]})
    assert unchanged.status_code == 304
    assert unchanged.headers["cache-control"] == "no-cache"


def test_backend_routes_keep_precedence(web_client):
    assert web_client.get("/api/v1/health").json() == {"status": "ok"}
    assert web_client.get("/api/v1/openapi.json").status_code == 200
    assert "swagger" in web_client.get("/docs").text.lower()
    # MCP auth and public invite errors must not turn into the web homepage.
    assert web_client.post("/mcp", json={}).status_code in (401, 503)
    assert web_client.get("/m/missing-invite").status_code == 404


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/not-a-route",
        "/assets/missing.js",
        "/fb/missing.jpg",
        "/%2e%2e/pyproject.toml",
    ],
)
def test_missing_routes_and_traversal_are_not_homepage(web_client, path):
    assert web_client.get(path).status_code == 404


def test_backend_still_boots_without_web_build(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "WEB_DIST_DIR", str(tmp_path / "missing"))
    with TestClient(create_app(lanes=())) as client:
        assert client.get("/api/v1/health").json() == {"status": "ok"}
        assert client.get("/").status_code == 404
