"""The /mcp endpoint: per-user token auth, protocol negotiation, tool calls."""

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.surfaces.test_mcp_tools import Rig, person

TOKEN = "mvs_s3cret-token-for-tests"
MINTED = {TOKEN: "u_demo"}
HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}
VERSIONS = ("2025-11-25", "2025-06-18", "2025-03-26")
TOOLS = {
    "draft_move",
    "confirm_move",
    "share_move",
    "pull_up",
    "friends_nearby",
    "get_my_active_move",
}


def rpc(method: str, params: dict | None = None, id_: int = 1) -> dict:
    return {"jsonrpc": "2.0", "id": id_, "method": method, "params": params or {}}


def init(version: str) -> dict:
    return rpc(
        "initialize",
        {
            "protocolVersion": version,
            "capabilities": {},
            "clientInfo": {"name": "muse", "version": "1"},
        },
    )


@pytest.fixture
def rig() -> Rig:
    return Rig(person("bo", "Bo Lee"), opted_in={"bo"})


@pytest.fixture
def callers() -> list[str]:
    """Every user id the tools were built for, in call order."""
    return []


@pytest.fixture
def client(
    rig: Rig, callers: list[str], monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    app = create_app(lanes=())

    def factory(_app, user_id: str):
        callers.append(user_id)
        return rig.tools

    app.state.mcp_tools_factory = factory
    app.state.mcp_resolve_token = MINTED.get
    with TestClient(app) as http:
        yield http


def post(client: TestClient, body: dict, **headers: str):
    return client.post("/mcp", json=body, headers={**HEADERS, **headers})


def bearer(token: str = TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def call(client: TestClient, name: str, args: dict, token: str = TOKEN) -> dict:
    res = post(
        client,
        rpc("tools/call", {"name": name, "arguments": args}),
        **bearer(token),
    )
    assert res.status_code == 200, res.text
    result = res.json()["result"]
    assert not result.get("isError"), result
    return json.loads(result["content"][0]["text"])


# -- auth ---------------------------------------------------------------------


def test_missing_credentials_is_401(client: TestClient) -> None:
    res = post(client, init("2025-11-25"))
    assert res.status_code == 401 and res.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "headers",
    [
        {"Authorization": "Bearer wrong"},
        {"Authorization": f"Basic {TOKEN}"},
        {"Authorization": TOKEN},
        {"X-API-Key": "wrong"},
        {"X-API-Key": ""},
    ],
)
def test_wrong_credentials_are_401(client: TestClient, headers: dict) -> None:
    assert post(client, init("2025-11-25"), **headers).status_code == 401


def test_bearer_token_is_accepted(client: TestClient) -> None:
    assert post(client, init("2025-11-25"), **bearer()).status_code == 200


def test_x_api_key_is_accepted(client: TestClient) -> None:
    res = post(client, init("2025-11-25"), **{"X-API-Key": TOKEN})
    assert res.status_code == 200


def test_bearer_scheme_is_case_insensitive(client: TestClient) -> None:
    res = post(client, init("2025-11-25"), Authorization=f"bearer {TOKEN}")
    assert res.status_code == 200


def test_get_without_credentials_is_401(client: TestClient) -> None:
    assert client.get("/mcp").status_code == 401


def test_token_is_never_in_the_response(client: TestClient) -> None:
    res = post(client, init("2025-11-25"), Authorization="Bearer wrong")
    assert "wrong" not in res.text and TOKEN not in res.text


# -- protocol -----------------------------------------------------------------


@pytest.mark.parametrize("version", VERSIONS)
def test_negotiates_each_protocol_version(client: TestClient, version: str) -> None:
    res = post(client, init(version), **bearer())
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    result = res.json()["result"]
    assert result["protocolVersion"] == version
    assert result["serverInfo"]["name"] == "Moves"


def test_unknown_version_falls_back_to_a_supported_one(client: TestClient) -> None:
    res = post(client, init("2099-01-01"), **bearer())
    assert res.json()["result"]["protocolVersion"] in VERSIONS


def test_lists_the_six_tools_with_descriptions(client: TestClient) -> None:
    res = post(
        client,
        rpc("tools/list"),
        **bearer(),
        **{"MCP-Protocol-Version": "2025-11-25"},
    )
    tools = {t["name"]: t for t in res.json()["result"]["tools"]}
    assert set(tools) == TOOLS
    assert all(t["description"] for t in tools.values())
    assert (
        "AFTER the user has explicitly confirmed"
        in tools["confirm_move"]["description"]
    )
    assert "request_id" in tools["confirm_move"]["inputSchema"]["required"]


# -- tools over HTTP --------------------------------------------------------------


def test_draft_then_confirm_over_http(client: TestClient, rig: Rig) -> None:
    draft = call(
        client,
        "draft_move",
        {"text": "getting boba", "to": ["Bo"], "place": "Kumo"},
    )
    assert draft["status"] == "draft" and rig.moves.created == []
    posted = call(
        client,
        "confirm_move",
        {"draft_id": draft["draft_id"], "request_id": "r-1"},
    )
    retry = call(
        client,
        "confirm_move",
        {"draft_id": draft["draft_id"], "request_id": "r-1"},
    )
    assert posted["status"] == "posted" and retry == posted
    assert len(rig.moves.created) == 1


def test_read_tools_over_http(client: TestClient) -> None:
    assert call(client, "get_my_active_move", {}) == {"status": "ok", "active": False}
    assert call(client, "friends_nearby", {})["count"] == 0


def test_app_can_start_more_than_once(monkeypatch: pytest.MonkeyPatch) -> None:
    """The SDK session manager runs once per instance; each startup gets its own."""
    app = create_app(lanes=())
    app.state.mcp_resolve_token = MINTED.get
    for _ in range(2):
        with TestClient(app) as http:
            res = http.post(
                "/mcp", json=init("2025-11-25"), headers={**HEADERS, **bearer()}
            )
            assert res.status_code == 200
