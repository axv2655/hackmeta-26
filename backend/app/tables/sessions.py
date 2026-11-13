"""Login sessions: the token the app sends instead of a bare `X-User-Id`.

A new module so existing databases only gain a table (`create_all` adds it).
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.tables.types import UTCDateTime


class AuthSession(SQLModel, table=True):
    __tablename__ = "auth_sessions"

    token_hash: str = Field(primary_key=True)  # SHA-256 hex, never the token
    user_id: str = Field(foreign_key="users.id", index=True)
    created_at: datetime = Field(sa_type=UTCDateTime)
    last_used_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
