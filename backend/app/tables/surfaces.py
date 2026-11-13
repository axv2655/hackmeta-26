"""Tables written only by the surfaces lane (ARCHITECTURE.md 5.4, 5.5, 8.2).

Any lane may read these.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.ports import Category, HourBucket, ProximityTokenKind, SightingSource
from app.tables.types import UTCDateTime, new_id

# --- Proximity (8.2 to 8.5) ---------------------------------------------------


class ProximityToken(SQLModel, table=True):
    """Rotating BLE token -> owner. Only the server can resolve a token (8.2).
    `kind="move"` is an open-Move beacon (8.5) and carries `move_id`."""

    __tablename__ = "proximity_tokens"

    token: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    kind: ProximityTokenKind = Field(default="user", sa_type=String)
    move_id: str | None = Field(default=None, foreign_key="moves.id")
    expires_at: datetime = Field(sa_type=UTCDateTime)


class ProximitySighting(SQLModel, table=True):
    """Raw co-presence evidence, purged after 2 hours."""

    __tablename__ = "proximity_sightings"

    id: int | None = Field(default=None, primary_key=True)
    observer_id: str = Field(foreign_key="users.id", index=True)
    observed_id: str = Field(foreign_key="users.id", index=True)
    rssi: int
    seen_at: datetime = Field(sa_type=UTCDateTime, index=True)
    source: SightingSource = Field(default="ble", sa_type=String)


class Copresence(SQLModel, table=True):
    """Pairs together right now, one row per pair with `user_a < user_b`."""

    __tablename__ = "copresence"

    user_a: str = Field(foreign_key="users.id", primary_key=True)
    user_b: str = Field(foreign_key="users.id", primary_key=True, index=True)
    first_seen: datetime = Field(sa_type=UTCDateTime)
    last_seen: datetime = Field(sa_type=UTCDateTime)


# --- History, ratings, rankings (5.4, 13) -------------------------------------


class Hangout(SQLModel, table=True):
    """One row per pair (`user_a < user_b`) per ended Move both attended."""

    __tablename__ = "hangouts"

    user_a: str = Field(foreign_key="users.id", primary_key=True)
    user_b: str = Field(foreign_key="users.id", primary_key=True, index=True)
    move_id: str = Field(foreign_key="moves.id", primary_key=True)
    mark_id: str = Field(foreign_key="marks.id", index=True)
    category: Category = Field(sa_type=String)
    weekday: int  # 0 = Monday
    hour_bucket: HourBucket = Field(sa_type=String)
    at: datetime = Field(sa_type=UTCDateTime, index=True)


class Rating(SQLModel, table=True):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("move_id", "user_id"),)

    id: str = Field(default_factory=new_id, primary_key=True)
    move_id: str = Field(foreign_key="moves.id", index=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    mark_id: str = Field(foreign_key="marks.id", index=True)
    stars: int  # 1..5; faces map to 5 / 3 / 1
    vibe_tags: list[str] = Field(default_factory=list, sa_type=JSON)
    note: str = ""
    # [{"other_mark_id": "...", "preferred": "this" | "other"}]
    comparisons: list[dict[str, Any]] = Field(default_factory=list, sa_type=JSON)
    created_at: datetime = Field(sa_type=UTCDateTime)


class MarkRanking(SQLModel, table=True):
    """Per-user Beli-style ordered list per category."""

    __tablename__ = "mark_rankings"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    mark_id: str = Field(foreign_key="marks.id", primary_key=True, index=True)
    category: Category = Field(sa_type=String, index=True)
    position: int
    score: float  # 0.0 to 10.0


# --- Mocked Facebook surfaces (5.5) -------------------------------------------


class CalendarEvent(SQLModel, table=True):
    """Mock calendar events, or device busy blocks (start/end only, title None)."""

    __tablename__ = "calendar_events"

    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    title: str | None = None
    starts_at: datetime = Field(sa_type=UTCDateTime)
    ends_at: datetime = Field(sa_type=UTCDateTime)
    location: str | None = None


class Reel(SQLModel, table=True):
    __tablename__ = "reels"

    id: str = Field(default_factory=new_id, primary_key=True)
    author_name: str
    video_url: str
    thumb_url: str
    caption: str = ""
    geotag_mark_id: str | None = Field(default=None, foreign_key="marks.id")
    resolved_mark_id: str | None = Field(default=None, foreign_key="marks.id")
    likes: int = 0


class SavedReel(SQLModel, table=True):
    __tablename__ = "saved_reels"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    reel_id: str = Field(foreign_key="reels.id", primary_key=True)
    saved_at: datetime = Field(sa_type=UTCDateTime)
