"""S11: pure, Clock-relative history patterns (table inserts land with T0)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.seed.history import HistoryEvent, generate_history

BASE = datetime(2026, 11, 12, 10, 30, tzinfo=UTC)  # a Thursday


def days_ago(event: HistoryEvent, now: datetime) -> float:
    return (now - event.starts_at) / timedelta(days=1)


def by_category(events, category):
    return [e for e in events if e.category == category]


def with_group(events, *members):
    return [e for e in events if set(members) <= set(e.users)]


@pytest.fixture(params=range(14))
def now(request):
    """Fourteen consecutive days: covers weekends, Thursday and every weekday."""
    return BASE + timedelta(days=request.param)


class TestShape:
    def test_every_event_has_ended_before_now(self, now):
        assert all(e.ends_at <= now for e in generate_history(now))

    def test_everything_is_within_eight_weeks(self, now):
        assert all(days_ago(e, now) <= 57 for e in generate_history(now))

    def test_events_are_sorted_oldest_first(self, now):
        events = generate_history(now)
        assert events == sorted(events, key=lambda e: e.starts_at)

    def test_end_is_after_start(self, now):
        assert all(e.ends_at > e.starts_at for e in generate_history(now))

    def test_naive_now_is_rejected(self):
        with pytest.raises(ValueError):
            generate_history(datetime(2026, 11, 12, 10))

    def test_is_deterministic(self, now):
        assert generate_history(now) == generate_history(now)


class TestMatchaPattern:
    def test_anish_and_priya_on_weekday_afternoons(self, now):
        events = with_group(
            by_category(generate_history(now), "coffee"), "anish", "priya"
        )
        assert events
        assert all(e.starts_at.weekday() < 5 for e in events)
        assert all(12 <= e.starts_at.hour < 18 for e in events)

    def test_four_distinct_matcha_spots_in_the_last_month(self, now):
        recent = [
            e
            for e in with_group(
                by_category(generate_history(now), "coffee"), "anish", "priya"
            )
            if days_ago(e, now) <= 30
        ]
        assert len({e.mark_key for e in recent}) == 4

    def test_tony_joins_some_but_not_all(self, now):
        events = with_group(
            by_category(generate_history(now), "coffee"), "anish", "priya"
        )
        with_tony = [e for e in events if "tony" in e.users]
        assert 0 < len(with_tony) < len(events)


class TestLunchPattern:
    def test_anish_tony_maya_lunch(self, now):
        events = with_group(
            by_category(generate_history(now), "food"), "anish", "tony", "maya"
        )
        assert len(events) >= 3
        assert all(11 <= e.starts_at.hour <= 13 for e in events)


class TestFadingClimbingGroup:
    def test_anish_maya_dev_climb_on_thursdays(self, now):
        events = with_group(
            by_category(generate_history(now), "climbing"), "anish", "maya", "dev"
        )
        assert len(events) >= 3
        assert all(e.starts_at.weekday() == 3 for e in events)

    def test_the_group_stopped_at_least_four_weeks_ago(self, now):
        events = with_group(
            by_category(generate_history(now), "climbing"), "anish", "maya", "dev"
        )
        assert min(days_ago(e, now) for e in events) >= 28


class TestHighSchoolFriends:
    def test_exactly_one_hangout_about_six_weeks_ago(self, now):
        events = [
            e
            for e in generate_history(now)
            if any(u.startswith("hs_") for u in e.users)
        ]
        assert len(events) == 1
        assert 41 <= days_ago(events[0], now) <= 49


class TestRelativeToClock:
    def test_shifting_now_shifts_every_event_by_whole_weeks_of_pattern(self):
        a = generate_history(BASE)
        b = generate_history(BASE + timedelta(days=7))
        assert len(a) == len(b)
        assert [e.category for e in a] == [e.category for e in b]
        assert [e.users for e in a] == [e.users for e in b]
        assert [e.starts_at + timedelta(days=7) for e in a] == [e.starts_at for e in b]
