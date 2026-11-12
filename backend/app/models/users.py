"""HTTP schemas for users."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.ports import Category
from app.services.users import FriendTier


class UserLite(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    first_name: str
    avatar_url: str
    avatar_color: str
    fb_verified: bool

class UserRead(UserLite):
    home_area: str

class QuietHours(BaseModel):
    start: int = Field(ge=0, le=23)
    end: int = Field(ge=0, le=23)

class SettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    location_opt_in: bool
    ble_opt_in: bool
    calendar_opt_in: bool
    open_moves_opt_in: bool
    muse_proactive: bool
    ghost_visible: bool
    default_circle_ids: list[str]
    move_categories: list[Category]
    quiet_hours: QuietHours | None

class SettingsUpdate(BaseModel):
    """Only the fields sent are changed; `quiet_hours: null` clears them."""

    model_config = ConfigDict(extra="forbid")

    location_opt_in: bool | None = None
    ble_opt_in: bool | None = None
    calendar_opt_in: bool | None = None
    open_moves_opt_in: bool | None = None
    muse_proactive: bool | None = None
    ghost_visible: bool | None = None
    default_circle_ids: list[str] | None = None
    move_categories: list[Category] | None = None
    quiet_hours: QuietHours | None = None

class MeRead(BaseModel):
    user: UserRead
    settings: SettingsRead

class FriendRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserLite
    tier: FriendTier
    since: datetime

class BlockCreate(BaseModel):
    user_id: str

class AutojoinUpdate(BaseModel):
    user_ids: list[str]
