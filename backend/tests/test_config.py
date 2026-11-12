"""DATABASE_URL is optional, secret, and read from the environment."""

from pydantic import SecretStr

from app.core.config import Settings

URL = "postgres://user:s3cret@db.example.com:5432/app?sslmode=require"


def make(**values):
    return Settings(_env_file=None, **values)


def test_database_url_is_optional():
    assert make().DATABASE_URL is None


def test_database_url_is_read_as_a_secret():
    settings = make(DATABASE_URL=URL)
    assert isinstance(settings.DATABASE_URL, SecretStr)
    assert settings.DATABASE_URL.get_secret_value() == URL


def test_database_url_never_appears_in_repr_or_str():
    settings = make(DATABASE_URL=URL)
    assert "s3cret" not in repr(settings)
    assert "s3cret" not in str(settings)
    assert "s3cret" not in repr(settings.DATABASE_URL)


def test_database_url_is_read_from_the_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", URL)
    assert make().DATABASE_URL.get_secret_value() == URL


def test_empty_database_url_counts_as_unset(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    assert make().DATABASE_URL is None
