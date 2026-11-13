"""Phones to push to: one row per APNs device token."""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.tables.types import UTCDateTime


class PushToken(SQLModel, table=True):
    __tablename__ = "push_tokens"

    token: str = Field(primary_key=True)  # APNs device token, hex
    user_id: str = Field(foreign_key="users.id", index=True)
    sandbox: bool = True  # development builds talk to the APNs sandbox
    updated_at: datetime = Field(sa_type=UTCDateTime)
