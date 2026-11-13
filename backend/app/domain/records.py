"""Detached value records shared by core use cases. No ORM dependencies."""
from __future__ import annotations

import datetime
import typing
from dataclasses import dataclass, field
from uuid import uuid4


def new_id() -> str:
    return uuid4().hex[:12]


@dataclass(frozen=True, kw_only=True)
class User:
    id: str = field(default_factory=new_id)
    name: str
    first_name: str
    avatar_url: str = ''
    avatar_color: str = ''
    fb_verified: bool = False
    home_area: str = ''
    last_area: str | None = None
    created_at: datetime.datetime

@dataclass(frozen=True, kw_only=True)
class UserSettings:
    user_id: str
    location_opt_in: bool = False
    ble_opt_in: bool = False
    calendar_opt_in: bool = False
    open_moves_opt_in: bool = False
    muse_proactive: bool = True
    ghost_visible: bool = True
    default_circle_ids: list[str] = field(default_factory=list)
    move_categories: list[
        typing.Literal[
            "food",
            "coffee",
            "study",
            "fitness",
            "nightlife",
            "outdoors",
            "games",
            "shopping",
            "errand",
            "other",
        ]
    ] = field(default_factory=list)
    quiet_hours: dict[str, int] | None = None

@dataclass(frozen=True, kw_only=True)
class Circle:
    id: str = field(default_factory=new_id)
    owner_id: str
    name: str
    emoji: str = ''
    fb_group_name: str | None = None

@dataclass(frozen=True, kw_only=True)
class Moment:
    id: str = field(default_factory=new_id)
    move_id: str
    mark_id: str
    author_id: str
    media_url: str
    media_type: typing.Literal['photo', 'clip'] = 'photo'
    caption: str = ''
    status: typing.Literal['pending', 'approved'] = 'pending'
    created_at: datetime.datetime

@dataclass(frozen=True, kw_only=True)
class MomentTag:
    moment_id: str
    user_id: str
    approved: bool | None = None

@dataclass(frozen=True, kw_only=True)
class SavedMark:
    user_id: str
    mark_id: str
    source: typing.Literal['map', 'reel'] = 'map'
    source_ref: str | None = None
    note: str = ''
    saved_at: datetime.datetime
    flared_at: datetime.datetime | None = None

@dataclass(frozen=True, kw_only=True)
class Reel:
    id: str = field(default_factory=new_id)
    author_name: str
    video_url: str
    thumb_url: str
    caption: str = ''
    geotag_mark_id: str | None = None
    resolved_mark_id: str | None = None
    likes: int = 0

@dataclass(frozen=True, kw_only=True)
class SavedReel:
    user_id: str
    reel_id: str
    saved_at: datetime.datetime
