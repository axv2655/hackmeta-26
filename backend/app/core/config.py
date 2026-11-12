from pathlib import Path
from typing import Literal

from pydantic import HttpUrl, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
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


settings = Settings()
