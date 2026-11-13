from pathlib import Path
from typing import Literal

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "hackmeta-26"
    API_V1_STR: str = "/api/v1"
    FRONTEND_HOST: str = "http://localhost:8081"
    FASTAPI_ENV: Literal["development", "staging", "production"] = "development"
    SENTRY_DSN: HttpUrl | None = None
    # Held as a secret so the password never shows up in a repr or a log line.
    # Read it with `settings.DATABASE_URL.get_secret_value()`.
    DATABASE_URL: SecretStr | None = None

    # SQLite file, or ":memory:" for a throwaway in-process database.
    DB_PATH: str = str(BACKEND_DIR / "data" / "app.db")
    # Where uploaded Moment media is stored (served by GET /media/{file}).
    MEDIA_DIR: str = str(BACKEND_DIR / "data" / "uploads")
    # Unset: no /demo routes, system time. "on": Demo Control and a shiftable
    # clock. "offline": same, and Muse is replaced by its fake client.
    DEMO_MODE: Literal["on", "offline"] | None = None

    # Muse model API (ARCHITECTURE.md 3.2); read only by the muse lane.
    MUSE_BASE_URL: HttpUrl | None = None
    MUSE_API_KEY: SecretStr | None = None
    MUSE_MODEL: str | None = None
    MUSE_VISION_MODEL: str | None = None


settings = Settings()
