"""Routes owned by muse M7 (ARCHITECTURE.md 14.2). Stub until then.

GET /suggestions, POST /suggestions/{id}/accept,
POST /suggestions/{id}/dismiss
"""

from fastapi import APIRouter

router = APIRouter(tags=["suggestions"])
