"""Friend requests: one row per pending "add friend", sender to recipient.
Accepting turns it into a `friendships` row and deletes it."""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.tables.types import UTCDateTime


class FriendRequest(SQLModel, table=True):
    __tablename__ = "friend_requests"

    from_id: str = Field(foreign_key="users.id", primary_key=True)
    to_id: str = Field(foreign_key="users.id", primary_key=True, index=True)
    created_at: datetime = Field(sa_type=UTCDateTime)
