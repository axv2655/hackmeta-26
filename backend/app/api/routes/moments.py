"""Routes owned by core C8 (ARCHITECTURE.md 14.2). Stub until then.

GET/POST /moves/{id}/moments, POST /moments/{id}/approve
"""

from fastapi import APIRouter

router = APIRouter(tags=["moments"])
