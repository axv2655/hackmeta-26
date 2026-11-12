"""Tables written only by the muse lane (ARCHITECTURE.md 5.4). Any lane may read."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.ports import NotificationType, SuggestionStatus, SuggestionType, TasteSubject
from app.tables.types import UTCDateTime, new_id


class MuseRun(SQLModel, table=True):
    """Audit and cost log: one row per Muse call, fallback or not."""

    __tablename__ = "muse_runs"

    id: str = Field(default_factory=new_id, primary_key=True)
    agent: str = Field(index=True)
    user_id: str | None = Field(default=None, foreign_key="users.id")
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    ok: bool
    used_fallback: bool
    prompt_hash: str = Field(index=True)
    output: dict[str, Any] | None = Field(default=None, sa_type=JSON)
    created_at: datetime = Field(sa_type=UTCDateTime)


class TasteProfile(SQLModel, table=True):
    __tablename__ = "taste_profiles"
    __table_args__ = (UniqueConstraint("subject_type", "subject_id"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    subject_type: TasteSubject = Field(sa_type=String)
    subject_id: str = Field(index=True)  # user id or pseudo-group id
    summary: str = ""
    likes: list[str] = Field(default_factory=list, sa_type=JSON)
    dislikes: list[str] = Field(default_factory=list, sa_type=JSON)
    updated_at: datetime = Field(sa_type=UTCDateTime)


class PseudoGroup(SQLModel, table=True):
    """Muse-inferred clusters; never shown as real groups."""

    __tablename__ = "pseudo_groups"

    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="users.id", index=True)
    label: str
    member_ids: list[str] = Field(default_factory=list, sa_type=JSON)
    # {"categories": [...], "weekdays": [...], "hour_buckets": [...], "mark_ids": [...]}
    pattern: dict[str, list[Any]] = Field(default_factory=dict, sa_type=JSON)
    strength: float = 0.0
    last_hangout_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    fading: bool = False


class Suggestion(SQLModel, table=True):
    """Anything Muse proposes to a user."""

    __tablename__ = "suggestions"

    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    type: SuggestionType = Field(sa_type=String)
    payload: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)  # draft + chips
    status: SuggestionStatus = Field(default="pending", sa_type=String, index=True)
    created_at: datetime = Field(sa_type=UTCDateTime)
    expires_at: datetime = Field(sa_type=UTCDateTime)


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    type: NotificationType = Field(sa_type=String)
    title: str
    body: str
    data: dict[str, str] = Field(default_factory=dict, sa_type=JSON)  # deep link
    read_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    created_at: datetime = Field(sa_type=UTCDateTime)
