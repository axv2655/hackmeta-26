from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import StatementError
from sqlmodel import Session

from app.tables import Move, User, metadata

NOW = datetime(2026, 1, 1, 12, tzinfo=UTC)

EXPECTED = {
    # core
    "users", "friendships", "circles", "circle_members", "blocks",
    "user_settings", "autojoin_prefs", "marks", "saved_marks", "moves",
    "move_audience", "move_audience_circles", "move_participants", "moments",
    "moment_tags",
    # muse
    "muse_runs", "taste_profiles", "pseudo_groups", "suggestions", "notifications",
    # surfaces
    "proximity_tokens", "proximity_sightings", "copresence", "hangouts", "ratings",
    "mark_rankings", "calendar_events", "reels", "saved_reels",
    # messages
    "move_invites",
    "credentials",
    "push_tokens",
    "friend_requests",
}  # fmt: skip


def test_every_table_is_registered() -> None:
    assert set(metadata.tables) == EXPECTED


def test_datetimes_round_trip_as_aware_utc(session: Session) -> None:
    plus_two = timezone(timedelta(hours=2))
    session.add(User(id="u1", name="Anish A", first_name="Anish", created_at=NOW))
    session.add(
        Move(
            id="m1",
            creator_id="u1",
            mark_id="k1",
            text="matcha?",
            category="coffee",
            starts_at=NOW.astimezone(plus_two),
            created_at=NOW,
        )
    )
    session.commit()
    session.expire_all()
    move = session.get(Move, "m1")
    assert move is not None
    assert move.starts_at == NOW
    assert move.starts_at.tzinfo is UTC


def test_naive_datetimes_are_rejected(session: Session) -> None:
    session.add(
        User(id="u1", name="A", first_name="A", created_at=datetime(2026, 1, 1))
    )
    with pytest.raises(StatementError):
        session.commit()
