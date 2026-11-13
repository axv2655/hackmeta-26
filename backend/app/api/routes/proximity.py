"""Routes owned by surfaces S1, S2 (ARCHITECTURE.md 14.2). Stub until then.

POST /proximity/token, POST /proximity/sightings,
POST /proximity/prompt/{move_id}/accept
"""

from fastapi import APIRouter

router = APIRouter(tags=["proximity"])
