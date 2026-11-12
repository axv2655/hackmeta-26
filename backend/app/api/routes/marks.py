"""Routes owned by core C6 (ARCHITECTURE.md 14.2). Stub until then.

GET /marks/nearby, GET /marks/search, POST /marks, GET /marks/{id},
POST/DELETE /marks/{id}/save, GET /me/saved
"""

from fastapi import APIRouter

router = APIRouter(tags=["marks"])
