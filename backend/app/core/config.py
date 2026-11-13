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
    MUSE_MODEL: str | None = "muse-spark-1.3"
    MUSE_VISION_MODEL: str | None = None
    # Input + output tokens one backend process may spend on Muse. Once used,
    # every agent answers with its heuristic fallback (no network call).
    MUSE_TOKEN_BUDGET: int = 400000
    # True: Muse never calls the model. Ranking, recommended Moves (flares,
    # nobody-bit, revive, spots) and who to nudge all come from deterministic
    # scores; copy comes from templates. False: agents ask the model and fall
    # back to the same scores on failure.
    MUSE_DETERMINISTIC: bool = True

    # Shared invite links (ARCHITECTURE.md 9.4): public origin of the /m/{token}
    # page, e.g. a tunnel. Unset: the URL the request came in on (LAN only).
    PUBLIC_BASE_URL: HttpUrl | None = None

    # Reverse geocoder for the city name at the map's center (GET /areas/city):
    # any Nominatim-compatible server. Empty: only the configured AREAS answer.
    GEOCODER_URL: str = "https://nominatim.openstreetmap.org"

    # Apple push (APNs) with a token-based .p8 key. Unset key: no pushes, the
    # app still gets everything in-app over the socket.
    APNS_KEY_PATH: str | None = None  # path to AuthKey_XXXX.p8
    APNS_KEY_ID: str | None = None
    APNS_TEAM_ID: str | None = None
    APNS_TOPIC: str | None = None  # the app's bundle id
    APNS_SANDBOX: bool = True  # development-signed builds use the sandbox


settings = Settings()
