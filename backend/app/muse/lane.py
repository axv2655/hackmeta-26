"""Everything a muse service needs, in one object.

`MuseLane` holds the engine, the `Container` (other lanes' ports, read at call
time), the shared `MuseRunner` and the gateway. Services take
`(session, lane)`; gateway-bound functions and scheduler jobs open their own
session with `lane.session()`.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import Engine
from sqlmodel import Session

from app.container import Container
from app.muse.client import FakeMuseClient, MuseClient
from app.muse.gateway import MuseGatewayImpl
from app.muse.runner import MuseRunner


@dataclass
class MuseLane:
    engine: Engine
    container: Container
    runner: MuseRunner
    gateway: MuseGatewayImpl = field(init=False)

    def __post_init__(self) -> None:
        self.gateway = MuseGatewayImpl(self.runner, lane=self)

    @classmethod
    def build(
        cls, engine: Engine, container: Container, client: MuseClient
    ) -> MuseLane:
        runner = MuseRunner(client, clock=lambda: container.clock, engine=engine)
        return cls(engine, container, runner)

    def now(self) -> datetime:
        return self.container.clock.now()

    @contextmanager
    def session(self) -> Iterator[Session]:
        with Session(self.engine) as session:
            yield session


def lane_for(container: Container, session: Session) -> MuseLane:
    """The registered lane, or a fallback-only one when the muse lane is not
    registered (the app booted with `lanes=()`)."""
    lane = getattr(container.muse, "lane", None)
    if isinstance(lane, MuseLane):
        return lane
    return MuseLane.build(session.get_bind(), container, FakeMuseClient())
