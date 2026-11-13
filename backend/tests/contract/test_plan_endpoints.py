"""Every endpoint the mobile app was promised tonight (plan A.1-A.9) exists.

A missing route would surface on stage as a 404 or 405 in the app, so this
checks the OpenAPI schema of the real app with every lane registered. It also
checks rule 1.5.2 at the schema level: only Mark-shaped response schemas may
carry coordinates.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlmodel import Session

from app.core import db
from app.main import create_app
from tests.social.world import build

API = "/api/v1"
ANA = {"X-User-Id": "ana"}

PLAN_ENDPOINTS = [
    # A.1 existing endpoints mobile newly consumes
    ("GET", "/me"),
    ("PATCH", "/me/settings"),
    ("GET", "/friends"),
    ("GET", "/me/blocks"),
    ("POST", "/me/blocks"),
    ("DELETE", "/me/blocks/{user_id}"),
    ("GET", "/me/autojoin"),
    ("PUT", "/me/autojoin"),
    ("GET", "/circles"),
    ("POST", "/circles"),
    ("PATCH", "/circles/{circle_id}"),
    ("DELETE", "/circles/{circle_id}"),
    ("POST", "/audience/preview"),
    ("GET", "/marks/nearby"),
    ("GET", "/marks/search"),
    ("POST", "/marks"),
    ("GET", "/marks/{mark_id}"),
    ("POST", "/marks/{mark_id}/save"),
    ("DELETE", "/marks/{mark_id}/save"),
    ("GET", "/me/saved"),
    ("GET", "/moves/feed"),
    ("GET", "/moves/{move_id}"),
    ("POST", "/moves/{move_id}/join"),
    ("POST", "/moves/{move_id}/arrive"),
    ("POST", "/moves/{move_id}/end"),
    ("POST", "/moves"),
    ("GET", "/moves/{move_id}/invites"),
    ("GET", "/moves/{move_id}/moments"),
    ("POST", "/moments/{moment_id}/approve"),
    ("POST", "/muse/compose-move"),
    ("POST", "/muse/notify-preview"),
    ("POST", "/moves/{move_id}/notify"),
    ("POST", "/muse/suggest-spots"),
    ("GET", "/suggestions"),
    ("POST", "/suggestions/{suggestion_id}/accept"),
    ("GET", "/pseudo-groups"),
    ("POST", "/pseudo-groups/{group_id}/revive"),
    ("GET", "/notifications"),
    ("POST", "/notifications/read"),
    ("GET", "/users/search"),
    ("GET", "/friends/requests"),
    ("POST", "/friends/requests"),
    ("POST", "/friends/requests/{user_id}/accept"),
    ("DELETE", "/friends/requests/{user_id}"),
    ("DELETE", "/friends/{user_id}"),
    ("GET", "/auth/users"),
    ("POST", "/auth/signup"),
    # A.2 core
    ("POST", "/moves/{move_id}/leave"),
    # A.3 social and account
    ("GET", "/users/{user_id}"),
    ("GET", "/friends/suggestions"),
    ("PATCH", "/me"),
    ("POST", "/me/verify"),
    # A.4 Muse runtime
    ("GET", "/muse/status"),
    # A.5 Muse proactive
    ("POST", "/pseudo-groups/{group_id}/mute"),
    ("DELETE", "/pseudo-groups/{group_id}/mute"),
    ("POST", "/suggestions/{suggestion_id}/dismiss"),
    ("GET", "/me/taste"),
    # A.6 ratings and leaderboards
    ("GET", "/moves/{move_id}/rating/questions"),
    ("POST", "/moves/{move_id}/rating/next"),
    ("POST", "/moves/{move_id}/rating"),
    ("GET", "/leaderboards/spots"),
    ("GET", "/leaderboards/my-list"),
    # A.7 calendar and Reels
    ("GET", "/calendar"),
    ("PUT", "/calendar/busy"),
    ("GET", "/reels"),
    ("GET", "/reels/{reel_id}/place"),
    ("POST", "/reels/{reel_id}/save"),
    ("DELETE", "/reels/{reel_id}/save"),
    # A.8 proximity
    ("POST", "/proximity/prompt/{move_id}/accept"),
    ("POST", "/demo/copresence"),
    # A.9 Demo Control
    ("GET", "/demo/state"),
    ("POST", "/demo/time"),
    ("POST", "/demo/reset"),
    ("POST", "/demo/flare-scan"),
    ("POST", "/demo/free-time"),
    ("POST", "/demo/revive-scan"),
    ("POST", "/demo/friend-move"),
    ("POST", "/demo/friend-join"),
    ("POST", "/demo/friend-leave"),
    ("POST", "/demo/friend-accept"),
    ("POST", "/demo/end-move"),
    ("POST", "/demo/nobody-bit"),
    ("GET", "/demo/muse-stats"),
]

COORDINATE_KEYS = frozenset({"lat", "lng", "latitude", "longitude"})
MARK_KEYS = frozenset({"id", "name", "category", "address", "vibe_tags"})
"""A schema with all of these is a Mark (MarkRead or MuseMark); only those may
carry lat/lng."""


@pytest.fixture(scope="module")
def app() -> FastAPI:
    return create_app()


@pytest.fixture(scope="module")
def spec(app: FastAPI) -> dict[str, Any]:
    return app.openapi()


@pytest.mark.parametrize(("method", "path"), PLAN_ENDPOINTS)
def test_plan_endpoint_exists(spec: dict[str, Any], method: str, path: str) -> None:
    operations = spec["paths"].get(API + path)
    assert operations is not None, f"{method} {path} is missing"
    assert method.lower() in operations, f"{method} {path} is missing"


def test_users_search_is_not_shadowed_by_the_profile_route(
    engine: Engine, session: Session
) -> None:
    build(session)

    def session_override() -> Iterator[Session]:
        with Session(engine) as s:
            yield s

    app = create_app(lanes=())
    app.dependency_overrides[db.get_session] = session_override
    with TestClient(app) as client:
        found = client.get(f"{API}/users/search?q=dee", headers=ANA)
        profile = client.get(f"{API}/users/bo", headers=ANA)
    assert found.status_code == 200
    assert isinstance(found.json(), list)
    assert profile.status_code == 200
    assert profile.json()["user"]["id"] == "bo"


def _refs(value: Any) -> set[str]:
    if isinstance(value, dict):
        found = {value["$ref"].rsplit("/", 1)[-1]} if "$ref" in value else set()
        for item in value.values():
            found |= _refs(item)
        return found
    if isinstance(value, list):
        return set().union(*(_refs(item) for item in value)) if value else set()
    return set()


def _response_schemas(spec: dict[str, Any]) -> set[str]:
    """Names of every component schema reachable from a response."""
    components = spec["components"]["schemas"]
    pending = set()
    for operations in spec["paths"].values():
        for operation in operations.values():
            pending |= _refs(operation.get("responses", {}))
    seen: set[str] = set()
    while pending:
        name = pending.pop()
        if name in seen or name not in components:
            continue
        seen.add(name)
        pending |= _refs(components[name]) - seen
    return seen - {"HTTPValidationError", "ValidationError"}


def test_only_mark_shaped_responses_carry_coordinates(spec: dict[str, Any]) -> None:
    components = spec["components"]["schemas"]
    offenders = []
    for name in sorted(_response_schemas(spec)):
        keys = set(components[name].get("properties", {}))
        if keys & COORDINATE_KEYS and not MARK_KEYS <= keys:
            offenders.append(f"{name}: {sorted(keys & COORDINATE_KEYS)}")
    assert offenders == []


def test_mark_schemas_are_reachable(spec: dict[str, Any]) -> None:
    """Guards the check above against passing because nothing was walked."""
    components = spec["components"]["schemas"]
    marks = [
        name
        for name in _response_schemas(spec)
        if {"lat", "lng"} <= set(components[name].get("properties", {}))
    ]
    assert marks, "no Mark schema found in any response"
