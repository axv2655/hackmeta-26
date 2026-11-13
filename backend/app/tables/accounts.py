"""Real accounts: a username and password for a `users` row.

Kept out of `users` so existing databases only gain a table (`create_all`
adds it on boot) and the mock "pick a user" world keeps working.
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.tables.types import UTCDateTime


class Credential(SQLModel, table=True):
    __tablename__ = "credentials"

    user_id: str = Field(foreign_key="users.id", primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str  # "scrypt$<salt hex>$<digest hex>", never the password
    created_at: datetime = Field(sa_type=UTCDateTime)
