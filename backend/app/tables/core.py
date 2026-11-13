"""Tables written only by the core lane (ARCHITECTURE.md 5.1 to 5.3).

Any lane may read these. Writes from other lanes go through a port
(`MoveGateway`, `MarkGateway`, `UserGateway`).
"""

from datetime import datetime

from sqlalchemy import JSON, String
from sqlmodel import Field, SQLModel

from app.ports import (
    AudienceVia,
    Category,
    JoinedVia,
    MarkSource,
    MediaType,
    MomentStatus,
    MoveKind,
    MoveOrigin,
    MoveStatus,
    ParticipantStatus,
    SaveSource,
)
from app.tables.types import UTCDateTime, new_id

# --- 5.1 People and audiences -------------------------------------------------


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    first_name: str
    avatar_url: str = ""
    avatar_color: str = ""
    fb_verified: bool = False
    home_area: str = ""
    last_area: str | None = None  # coarse area label only, never coordinates
    created_at: datetime = Field(sa_type=UTCDateTime)


class Friendship(SQLModel, table=True):
    """Undirected: one row per pair with `user_a < user_b`."""

    __tablename__ = "friendships"

    user_a: str = Field(foreign_key="users.id", primary_key=True)
    user_b: str = Field(foreign_key="users.id", primary_key=True, index=True)
    since: datetime = Field(sa_type=UTCDateTime)


class Circle(SQLModel, table=True):
    __tablename__ = "circles"

    id: str = Field(default_factory=new_id, primary_key=True)
    owner_id: str = Field(foreign_key="users.id", index=True)
    name: str
    emoji: str = ""
    fb_group_name: str | None = None


class CircleMember(SQLModel, table=True):
    __tablename__ = "circle_members"

    circle_id: str = Field(foreign_key="circles.id", primary_key=True)
    user_id: str = Field(foreign_key="users.id", primary_key=True, index=True)


class Block(SQLModel, table=True):
    """`user_id`'s Moves are never shown to `hidden_from_user_id`."""

    __tablename__ = "blocks"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    hidden_from_user_id: str = Field(
        foreign_key="users.id", primary_key=True, index=True
    )


class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    location_opt_in: bool = False
    ble_opt_in: bool = False
    calendar_opt_in: bool = False
    open_moves_opt_in: bool = False  # discover open Moves nearby (8.5)
    muse_proactive: bool = True
    ghost_visible: bool = True
    default_circle_ids: list[str] = Field(default_factory=list, sa_type=JSON)
    move_categories: list[Category] = Field(default_factory=list, sa_type=JSON)
    # Local hours, e.g. {"start": 23, "end": 8}. None means no quiet hours.
    quiet_hours: dict[str, int] | None = Field(default=None, sa_type=JSON)


class AutojoinPref(SQLModel, table=True):
    """Directional: `user_id` may be silently auto-joined when with `other_user_id`."""

    __tablename__ = "autojoin_prefs"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    other_user_id: str = Field(foreign_key="users.id", primary_key=True)


# --- 5.2 Places ---------------------------------------------------------------


class Mark(SQLModel, table=True):
    __tablename__ = "marks"

    id: str = Field(default_factory=new_id, primary_key=True)
    name: str = Field(index=True)
    category: Category = Field(sa_type=String, index=True)
    lat: float
    lng: float
    address: str = ""
    photo_url: str | None = None
    price_level: int | None = None
    vibe_tags: list[str] = Field(default_factory=list, sa_type=JSON)
    source: MarkSource = Field(default="seed", sa_type=String)
    created_by: str | None = Field(default=None, foreign_key="users.id")


class SavedMark(SQLModel, table=True):
    __tablename__ = "saved_marks"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    mark_id: str = Field(foreign_key="marks.id", primary_key=True)
    source: SaveSource = Field(default="map", sa_type=String)
    source_ref: str | None = None  # reel id when source == "reel"
    note: str = ""
    saved_at: datetime = Field(sa_type=UTCDateTime)
    flared_at: datetime | None = Field(default=None, sa_type=UTCDateTime)


# --- 5.3 Moves ----------------------------------------------------------------


class Move(SQLModel, table=True):
    __tablename__ = "moves"

    id: str = Field(default_factory=new_id, primary_key=True)
    creator_id: str = Field(foreign_key="users.id", index=True)
    mark_id: str = Field(foreign_key="marks.id", index=True)
    text: str
    category: Category = Field(sa_type=String)
    status: MoveStatus = Field(default="live", sa_type=String, index=True)
    kind: MoveKind = Field(default="move", sa_type=String)
    open: bool = False
    starts_at: datetime = Field(sa_type=UTCDateTime)
    fill_deadline: datetime | None = Field(default=None, sa_type=UTCDateTime)
    ends_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    origin: MoveOrigin = Field(default="manual", sa_type=String)
    origin_ref: str | None = None  # reel id, suggestion id
    # `notify_user_ids` from POST /moves: the creator's edited notify list,
    # forced into the notify pipeline (9.2). None means Muse picks alone.
    notify_user_ids: list[str] | None = Field(default=None, sa_type=JSON)
    created_at: datetime = Field(sa_type=UTCDateTime)


class MoveAudience(SQLModel, table=True):
    """Exactly who can see a Move, resolved at post time."""

    __tablename__ = "move_audience"

    move_id: str = Field(foreign_key="moves.id", primary_key=True)
    user_id: str = Field(foreign_key="users.id", primary_key=True, index=True)
    via: AudienceVia = "direct"


class MoveAudienceCircle(SQLModel, table=True):
    """Kept for the "Visible to: Roommates, ..." label."""

    __tablename__ = "move_audience_circles"

    move_id: str = Field(foreign_key="moves.id", primary_key=True)
    circle_id: str = Field(foreign_key="circles.id", primary_key=True)


class MoveParticipant(SQLModel, table=True):
    __tablename__ = "move_participants"

    move_id: str = Field(foreign_key="moves.id", primary_key=True)
    user_id: str = Field(foreign_key="users.id", primary_key=True, index=True)
    status: ParticipantStatus = Field(sa_type=String)
    joined_via: JoinedVia = Field(sa_type=String)
    joined_at: datetime = Field(sa_type=UTCDateTime)
    arrived_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
    left_at: datetime | None = Field(default=None, sa_type=UTCDateTime)


class Moment(SQLModel, table=True):
    __tablename__ = "moments"

    id: str = Field(default_factory=new_id, primary_key=True)
    move_id: str = Field(foreign_key="moves.id", index=True)
    mark_id: str = Field(foreign_key="marks.id", index=True)
    author_id: str = Field(foreign_key="users.id")
    media_url: str
    media_type: MediaType = Field(default="photo", sa_type=String)
    caption: str = ""
    status: MomentStatus = Field(default="pending", sa_type=String)
    created_at: datetime = Field(sa_type=UTCDateTime)


class MomentTag(SQLModel, table=True):
    __tablename__ = "moment_tags"

    moment_id: str = Field(foreign_key="moments.id", primary_key=True)
    user_id: str = Field(foreign_key="users.id", primary_key=True)
    approved: bool | None = None  # None until the tagged user answers
