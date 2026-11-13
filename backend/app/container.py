"""One slot per port, filled with null implementations until a lane registers.

Lanes assign their real implementation from `app/lanes/<lane>.py`, e.g.
`container.moves = SqlMoveGateway(...)`. Consumers read the slot at call time,
so registration order between lanes does not matter.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ports import (
    CalendarGateway,
    Clock,
    EventPublisher,
    MarkGateway,
    MoveGateway,
    MuseGateway,
    Notifier,
    ProximityGateway,
    PushSender,
    TimeControl,
    UserGateway,
)
from app.ports_null import (
    NullCalendarGateway,
    NullClock,
    NullEventPublisher,
    NullMarkGateway,
    NullMoveGateway,
    NullMuseGateway,
    NullNotifier,
    NullProximityGateway,
    NullPushSender,
    NullTimeControl,
    NullUserGateway,
)


@dataclass
class Container:
    clock: Clock = field(default_factory=NullClock)  # core C1
    time_control: TimeControl = field(default_factory=NullTimeControl)  # core C1
    events: EventPublisher = field(default_factory=NullEventPublisher)  # core C9
    moves: MoveGateway = field(default_factory=NullMoveGateway)  # core C4
    marks: MarkGateway = field(default_factory=NullMarkGateway)  # core C6
    users: UserGateway = field(default_factory=NullUserGateway)  # core C7
    notifier: Notifier = field(default_factory=NullNotifier)  # muse M4
    push: PushSender = field(default_factory=NullPushSender)  # APNs
    muse: MuseGateway = field(default_factory=NullMuseGateway)  # muse M1+
    proximity: ProximityGateway = field(default_factory=NullProximityGateway)  # S1
    calendar: CalendarGateway = field(default_factory=NullCalendarGateway)  # S5
