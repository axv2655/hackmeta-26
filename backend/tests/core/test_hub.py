"""ConnectionHub with fake sockets, then one round trip through `/api/v1/ws`."""

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app
from app.ports import EventPublisher
from app.realtime import ConnectionHub

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


class FixedClock:
    def now(self) -> datetime:
        return T0


class FakeSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []
        self.closed_with: int | None = None

    async def send_json(self, data: Any) -> None:
        self.sent.append(data)

    async def close(self, code: int = 1000) -> None:
        self.closed_with = code


class BrokenSocket(FakeSocket):
    async def send_json(self, data: Any) -> None:
        raise RuntimeError("socket is gone")


class StalledSocket(FakeSocket):
    async def send_json(self, data: Any) -> None:
        await asyncio.Event().wait()


class DisconnectingSocket(FakeSocket):
    """Its route's cleanup runs mid-send, as when the client drops then."""

    def __init__(self, hub: ConnectionHub, user_id: str) -> None:
        super().__init__()
        self.hub, self.user_id = hub, user_id

    async def send_json(self, data: Any) -> None:
        self.hub.disconnect(self.user_id, self)
        raise WebSocketDisconnect(1001)


@pytest.fixture
def hub() -> ConnectionHub:
    return ConnectionHub(FixedClock())


def publish(hub: ConnectionHub, user_ids: list[str], data: dict[str, Any]) -> None:
    asyncio.run(hub.publish(user_ids, "move.created", data))


def test_hub_is_an_event_publisher(hub: ConnectionHub) -> None:
    assert isinstance(hub, EventPublisher)


def test_envelope_is_type_data_ts(hub: ConnectionHub) -> None:
    socket = FakeSocket()
    hub.connect("u1", socket)
    publish(hub, ["u1"], {"move_id": "m1"})
    assert socket.sent == [
        {"type": "move.created", "data": {"move_id": "m1"}, "ts": T0.isoformat()}
    ]


def test_publish_reaches_only_targeted_users(hub: ConnectionHub) -> None:
    a, b, c = FakeSocket(), FakeSocket(), FakeSocket()
    hub.connect("a", a)
    hub.connect("b", b)
    hub.connect("c", c)
    publish(hub, ["a", "c"], {})
    assert (len(a.sent), len(b.sent), len(c.sent)) == (1, 0, 1)


def test_every_socket_of_a_user_receives_the_event(hub: ConnectionHub) -> None:
    phone, tablet = FakeSocket(), FakeSocket()
    hub.connect("u1", phone)
    hub.connect("u1", tablet)
    publish(hub, ["u1"], {})
    assert len(phone.sent) == len(tablet.sent) == 1


def test_a_user_listed_twice_gets_one_event(hub: ConnectionHub) -> None:
    socket = FakeSocket()
    hub.connect("u1", socket)
    publish(hub, ["u1", "u1"], {})
    assert len(socket.sent) == 1


def test_publish_to_user_without_sockets_is_a_noop(hub: ConnectionHub) -> None:
    publish(hub, ["nobody"], {})
    assert hub.socket_count("nobody") == 0


def test_disconnect_removes_only_that_socket(hub: ConnectionHub) -> None:
    kept, gone = FakeSocket(), FakeSocket()
    hub.connect("u1", kept)
    hub.connect("u1", gone)
    hub.disconnect("u1", gone)
    hub.disconnect("u1", gone)  # idempotent
    publish(hub, ["u1"], {})
    assert (len(kept.sent), len(gone.sent)) == (1, 0)
    hub.disconnect("u1", kept)
    assert hub.socket_count("u1") == 0


@pytest.mark.parametrize("dead_type", [BrokenSocket, StalledSocket])
def test_dead_socket_is_dropped_without_blocking_others(dead_type: type) -> None:
    # send_timeout=0 expires at the first suspension, so no time passes.
    hub = ConnectionHub(FixedClock(), send_timeout=0)
    dead, alive, other = dead_type(), FakeSocket(), FakeSocket()
    hub.connect("u1", dead)
    hub.connect("u1", alive)
    hub.connect("u2", other)
    publish(hub, ["u1", "u2"], {})
    assert (len(alive.sent), len(other.sent)) == (1, 1)
    assert dead.closed_with == 1011
    assert hub.socket_count("u1") == 1
    publish(hub, ["u1"], {})
    assert len(alive.sent) == 2


def test_disconnect_during_publish(hub: ConnectionHub) -> None:
    leaving, staying = DisconnectingSocket(hub, "u1"), FakeSocket()
    hub.connect("u1", leaving)
    hub.connect("u2", staying)
    publish(hub, ["u1", "u2"], {})
    assert len(staying.sent) == 1
    assert hub.socket_count("u1") == 0


# --- End to end through the route --------------------------------------------


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as client:
        client.app.state.container.events = ConnectionHub(FixedClock())
        yield client


def wait_for_sockets(client: TestClient, user_id: str, count: int) -> None:
    """Spin the app's loop until the route has (un)registered sockets."""
    hub = client.app.state.container.events

    async def settled() -> None:
        for _ in range(1000):
            if hub.socket_count(user_id) == count:
                return
            await asyncio.sleep(0)
        raise AssertionError(f"{user_id} has {hub.socket_count(user_id)} sockets")

    client.portal.call(settled)


def test_ws_route_delivers_events_and_cleans_up(client: TestClient) -> None:
    hub = client.app.state.container.events
    with (
        client.websocket_connect("/api/v1/ws?user_id=u1") as first,
        client.websocket_connect("/api/v1/ws?user_id=u1") as second,
        client.websocket_connect("/api/v1/ws?user_id=u2") as other,
    ):
        wait_for_sockets(client, "u1", 2)
        wait_for_sockets(client, "u2", 1)
        client.portal.call(hub.publish, ["u1"], "notification", {"id": "n1"})
        expected = {"type": "notification", "data": {"id": "n1"}, "ts": T0.isoformat()}
        assert first.receive_json() == expected
        assert second.receive_json() == expected
        client.portal.call(hub.publish, ["u2"], "move.ended", {})
        assert other.receive_json()["type"] == "move.ended"
    wait_for_sockets(client, "u1", 0)
    wait_for_sockets(client, "u2", 0)


def test_ws_route_requires_user_id(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/api/v1/ws"):
            pass
    assert closed.value.code == 1008


def test_ws_route_closes_when_core_lane_is_absent() -> None:
    with TestClient(create_app(lanes=())) as client:
        with pytest.raises(WebSocketDisconnect) as closed:
            with client.websocket_connect("/api/v1/ws?user_id=u1"):
                pass
    assert closed.value.code == 1013
