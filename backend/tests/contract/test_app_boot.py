"""The app boots with every port null, and every route module is mounted."""

import ast
import inspect
from collections.abc import Callable
from dataclasses import fields
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import ports, ports_null
from app.container import Container
from app.main import create_app

ROUTES_DIR = Path(__file__).resolve().parents[2] / "app" / "api" / "routes"
API_MAIN = ROUTES_DIR.parent / "main.py"

PORT_IMPLS = {
    ports.Clock: ports_null.NullClock,
    ports.TimeControl: ports_null.NullTimeControl,
    ports.EventPublisher: ports_null.NullEventPublisher,
    ports.Notifier: ports_null.NullNotifier,
    ports.MoveGateway: ports_null.NullMoveGateway,
    ports.MarkGateway: ports_null.NullMarkGateway,
    ports.UserGateway: ports_null.NullUserGateway,
    ports.MuseGateway: ports_null.NullMuseGateway,
    ports.ProximityGateway: ports_null.NullProximityGateway,
    ports.CalendarGateway: ports_null.NullCalendarGateway,
}


def test_app_boots_with_only_null_ports() -> None:
    app = create_app(lanes=())
    with TestClient(app) as client:
        assert client.get("/api/v1/health").json() == {"status": "ok"}
        assert client.get("/api/v1/openapi.json").status_code == 200
        container = app.state.container
        for slot in fields(Container):
            assert type(getattr(container, slot.name)).__name__.startswith("Null")


def test_default_app_boots_with_all_lanes_registered() -> None:
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/health").status_code == 200


def test_every_route_module_is_included_in_api_router() -> None:
    modules = {path.stem for path in ROUTES_DIR.glob("*.py")} - {"__init__"}
    tree = ast.parse(API_MAIN.read_text(encoding="utf-8"))
    included = {
        node.args[0].value.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and getattr(node.func, "attr", None) == "include_router"
        and isinstance(node.args[0], ast.Attribute)
        and isinstance(node.args[0].value, ast.Name)
    }
    assert included == modules


def test_every_container_slot_has_a_null_default() -> None:
    container = Container()
    for slot in fields(Container):
        assert type(getattr(container, slot.name)) in PORT_IMPLS.values()
    assert len(fields(Container)) == len(PORT_IMPLS)


def _signature(fn: Callable[..., object]) -> inspect.Signature:
    # eval_str: compare real types whether or not a module defers annotations.
    return inspect.signature(fn, eval_str=True)


@pytest.mark.parametrize("port", PORT_IMPLS, ids=lambda port: port.__name__)
def test_null_port_matches_protocol_signatures(port: type) -> None:
    impl = PORT_IMPLS[port]
    assert isinstance(impl(), port)
    for name, member in inspect.getmembers(port, inspect.isfunction):
        if name.startswith("_"):
            continue
        actual = getattr(impl, name)
        assert _signature(actual) == _signature(member), name
        assert inspect.iscoroutinefunction(actual) == inspect.iscoroutinefunction(
            member
        ), name
