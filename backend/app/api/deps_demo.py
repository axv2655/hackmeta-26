"""The Demo Control guard (ARCHITECTURE.md 15.2): every `/demo/*` route takes
`DemoGuard`, so with `DEMO_MODE` unset the whole surface answers 404 as if it
did not exist."""

from typing import Annotated

from fastapi import Depends

from app.core.config import settings
from app.domain.errors import NotFound


class DemoDisabled(NotFound):
    def __init__(self) -> None:
        super().__init__("Not found")


def require_demo() -> None:
    if not settings.DEMO_MODE:
        raise DemoDisabled()


DemoGuard = Annotated[None, Depends(require_demo)]
