"""Shared invite links (ARCHITECTURE.md 9.4).

`move_invites`: one row per time someone shares a Move from their phone. The
token in the link identifies the row, so the sharer can see whether the link
was opened and who said they're coming. No phone numbers are ever stored: the
text goes out from the sharer's own phone through the share sheet.
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.tables.types import UTCDateTime, new_id


class MoveInvite(SQLModel, table=True):
    __tablename__ = "move_invites"

    id: str = Field(default_factory=new_id, primary_key=True)
    token: str = Field(index=True, unique=True)
    move_id: str = Field(foreign_key="moves.id", index=True)
    inviter_id: str = Field(foreign_key="users.id", index=True)
    message: str = ""  # the line sent before the link
    created_at: datetime = Field(sa_type=UTCDateTime)
    opened_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    open_count: int = 0
    guest_name: str | None = None
    responded_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
