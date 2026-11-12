"""Routes owned by core C5 (ARCHITECTURE.md 14.2). Stub until then.

POST /moves, GET /moves/nearby, GET /moves/feed, GET /moves/{id},
POST /moves/{id}/join|arrive|leave|end
"""

from fastapi import APIRouter

router = APIRouter(tags=["moves"])
