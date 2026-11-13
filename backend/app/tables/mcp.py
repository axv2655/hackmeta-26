"""Per-user tokens for the remote MCP server at `/mcp` (ARCHITECTURE.md 11.4).

A new module so existing databases only gain a table (`create_all` adds it).
"""

from datetime import datetime

from sqlmodel import Field, SQLModel

from app.tables.types import UTCDateTime


class McpToken(SQLModel, table=True):
    __tablename__ = "mcp_tokens"

    id: str = Field(primary_key=True)
    user_id: str = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True, unique=True)  # SHA-256 hex, never the token
    hint: str  # "mvs_…abcd", for telling tokens apart
    label: str
    created_at: datetime = Field(sa_type=UTCDateTime)
    last_used_at: datetime | None = Field(default=None, sa_type=UTCDateTime)
