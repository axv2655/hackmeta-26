"""Routes owned by muse M4, M5, M8 (ARCHITECTURE.md 14.2). Stub until then.

POST /muse/compose-move, POST /muse/notify-preview,
POST /muse/suggest-spots
"""

from fastapi import APIRouter

router = APIRouter(tags=["muse"])
