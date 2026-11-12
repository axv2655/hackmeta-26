"""Routes owned by core C9 (ARCHITECTURE.md 9.1, 14.2).

WS /ws?user_id

Server push only: the socket is registered with the `ConnectionHub` and
anything the client sends is ignored until it disconnects.

The user is the `user_id` query parameter (mocked auth, 3.1; browsers cannot
set `X-User-Id` on a WebSocket), resolved with the same `find_user` as
`CurrentUserDep`. A missing or unknown user is closed with 1008.
"""

from fastapi import APIRouter, WebSocket, status

from app.api.deps import ContainerDep
from app.api.deps_core import find_user
from app.core.db import SessionDep
from app.realtime import ConnectionHub

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def events_socket(
    websocket: WebSocket,
    container: ContainerDep,
    session: SessionDep,
    user_id: str | None = None,
) -> None:
    hub = container.events
    if not isinstance(hub, ConnectionHub):
        # The core lane is not registered, so nothing would ever be pushed.
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return
    user = find_user(session, user_id)
    # The socket outlives the request; do not hold a connection open with it.
    session.close()
    if user is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    hub.connect(user.id, websocket)
    try:
        while (await websocket.receive())["type"] != "websocket.disconnect":
            pass
    finally:
        hub.disconnect(user.id, websocket)
