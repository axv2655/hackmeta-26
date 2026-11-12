"""Every SQLModel table (ARCHITECTURE.md section 5), split by write-owner.

A lane WRITES only the tables in its own module; reading any table is fine.
Import `metadata` (rather than `SQLModel.metadata`) to guarantee every table is
registered before `create_all`.

Frozen: changing a table needs an issue that all three lane owners approve.
"""

from sqlmodel import SQLModel

from app.tables.core import (
    AutojoinPref,
    Block,
    Circle,
    CircleMember,
    Friendship,
    Mark,
    Moment,
    MomentTag,
    Move,
    MoveAudience,
    MoveAudienceCircle,
    MoveParticipant,
    SavedMark,
    User,
    UserSettings,
)
from app.tables.muse import MuseRun, Notification, PseudoGroup, Suggestion, TasteProfile
from app.tables.surfaces import (
    CalendarEvent,
    Copresence,
    Hangout,
    MarkRanking,
    ProximitySighting,
    ProximityToken,
    Rating,
    Reel,
    SavedReel,
)
from app.tables.types import UTCDateTime, new_id

metadata = SQLModel.metadata

__all__ = [
    "AutojoinPref",
    "Block",
    "CalendarEvent",
    "Circle",
    "CircleMember",
    "Copresence",
    "Friendship",
    "Hangout",
    "Mark",
    "MarkRanking",
    "Moment",
    "MomentTag",
    "Move",
    "MoveAudience",
    "MoveAudienceCircle",
    "MoveParticipant",
    "MuseRun",
    "Notification",
    "ProximitySighting",
    "ProximityToken",
    "PseudoGroup",
    "Rating",
    "Reel",
    "SavedMark",
    "SavedReel",
    "Suggestion",
    "TasteProfile",
    "UTCDateTime",
    "User",
    "UserSettings",
    "metadata",
    "new_id",
]
