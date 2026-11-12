"""Muse-lane test setup. Async test modules set `pytestmark = pytest.mark.anyio`
(anyio ships with httpx); this pins the backend to asyncio."""

import pytest


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
