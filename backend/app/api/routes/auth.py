"""Mocked "Continue with Facebook" login (ARCHITECTURE.md 3.1, 6, 14.2).

GET /auth/users

The client lists the seeded users, stores the picked id, and sends it as
`X-User-Id` from then on (`app/api/deps_core.py`). This is the one core route
that needs no current user.
"""

from fastapi import APIRouter

from app.api.deps_core import UserServiceDep
from app.api.routes.users import UserLite

router = APIRouter(tags=["auth"])


@router.get("/auth/users")
def list_login_users(service: UserServiceDep) -> list[UserLite]:
    return [UserLite.model_validate(user) for user in service.list_users()]
