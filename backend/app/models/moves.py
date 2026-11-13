"""HTTP schemas for moves."""

from datetime import datetime

from pydantic import BaseModel

from app.models.audience import AudienceSummary
from app.models.marks import MarkRead
from app.models.users import UserLite
from app.ports import (
    Category,
    JoinedVia,
    MoveCreate,
    MoveKind,
    MoveOrigin,
    MoveStatus,
    ParticipantStatus,
)


class MoveCreateBody(BaseModel):
    """`MoveDraft` fields plus `open`, `origin` and `notify_user_ids` (14.2).

    `notify_user_ids` is the creator's edited notify list; leave it out to let
    Muse pick. `creator_there` says the device is inside the Mark's geofence.
    """

    mark_id: str
    text: str
    category: Category
    circle_ids: list[str] = []
    user_ids: list[str] = []
    kind: MoveKind = "move"
    open: bool = False
    fill_minutes: int | None = None
    origin: MoveOrigin = "manual"
    origin_ref: str | None = None
    creator_there: bool = False
    notify_user_ids: list[str] | None = None

    def to_domain(self) -> MoveCreate:
        notify = self.notify_user_ids
        return MoveCreate(
            mark_id=self.mark_id,
            text=self.text,
            category=self.category,
            circle_ids=tuple(self.circle_ids),
            user_ids=tuple(self.user_ids),
            kind=self.kind,
            open=self.open,
            fill_minutes=self.fill_minutes,
            origin=self.origin,
            origin_ref=self.origin_ref,
            creator_there=self.creator_there,
            notify_user_ids=None if notify is None else tuple(notify),
        )


class LeaveBody(BaseModel):
    """Optional body of `POST /moves/{id}/leave`. `quiet` removes the user
    without a ghost and tells only them (A.2)."""

    quiet: bool = False


class ParticipantRead(BaseModel):
    user: UserLite
    status: ParticipantStatus
    joined_via: JoinedVia


class MoveRead(BaseModel):
    """API `Move` (14.1)."""

    id: str
    creator: UserLite
    mark: MarkRead
    text: str
    category: Category
    status: MoveStatus
    kind: MoveKind
    open: bool
    starts_at: datetime
    fill_deadline: datetime | None
    ends_at: datetime | None
    participants: list[ParticipantRead]
    my_status: ParticipantStatus | None
    moments_count: int
    muse_reason: str | None
    audience: AudienceSummary | None
