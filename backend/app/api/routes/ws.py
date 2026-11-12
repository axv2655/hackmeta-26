"""Routes owned by core C9 (ARCHITECTURE.md 9.1, 14.2).

WS /ws?user_id

Server push only: the socket is registered with the `ConnectionHub` and
anything the client sends is ignored until it disconnects.

The user is the `user_id` query parameter (mocked auth, 3.1; browsers cannot
set `X-User-Id` on a WebSocket). This is a minimal local check until core C7's
shared user resolution in `api/deps_core.py` lands.
"""

from typing import Annotated

from fastapi import APIRouter, Query, WebSocket, status

from app.api.deps import ContainerDep
from app.realtime import ConnectionHub

router = APIRouter(tags=["realtime"])


@router.websocket("/ws")
async def events_socket(
    websocket: WebSocket,
    container: ContainerDep,
    user_id: Annotated[str, Query(min_length=1)],
) -> None:
    hub = container.events
    if not isinstance(hub, ConnectionHub):
        # The core lane is not registered, so nothing would ever be pushed.
        await websocket.close(code=status.WS_1013_TRY_AGAIN_LATER)
        return
    await websocket.accept()
    hub.connect(user_id, websocket)
    try:
        while (await websocket.receive())["type"] != "websocket.disconnect":
            pass
    finally:
        hub.disconnect(user_id, websocket)
