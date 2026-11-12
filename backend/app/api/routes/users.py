"""Routes owned by core C7 (ARCHITECTURE.md 14.2). Stub until then.

GET /me, PATCH /me/settings, GET /friends,
GET/POST/DELETE /me/blocks, GET/PUT /me/autojoin
"""

from fastapi import APIRouter

router = APIRouter(tags=["users"])
