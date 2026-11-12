"""S5: pure free_window tests (service/route tests land with T0)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.services.calendar import HORIZON, BusyBlock, Gap, free_window


def at(hour, minute=0, day=12):
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def block(start, end):
    return BusyBlock(start=start, end=end)


class TestSeededDemoGap:
    def test_gap_before_the_three_oclock_class(self):
        events = [block(at(9), at(10)), block(at(15), at(16, 15))]
        assert free_window(events, at(14, 10)) == Gap(at(14, 10), at(15))

    def test_gap_is_fifty_minutes(self):
        gap = free_window([block(at(15), at(16))], at(14, 10))
        assert gap.end - gap.start == timedelta(minutes=50)


class TestNoWindow:
    def test_now_inside_an_event_returns_none(self):
        assert free_window([block(at(14), at(15))], at(14, 30)) is None

    def test_event_starting_exactly_now_returns_none(self):
        assert free_window([block(at(14), at(15))], at(14)) is None

    def test_back_to_back_events_leave_no_window(self):
        events = [block(at(13), at(14)), block(at(14), at(15))]
        assert free_window(events, at(14)) is None

    def test_gap_shorter_than_minimum_returns_none(self):
        assert free_window([block(at(15), at(16))], at(14, 41)) is None

    def test_gap_of_exactly_the_minimum_is_returned(self):
        assert free_window([block(at(15), at(16))], at(14, 40)) == Gap(
            at(14, 40), at(15)
        )

    def test_custom_minimum_is_respected(self):
        assert free_window([block(at(15), at(16))], at(14, 40), min_minutes=30) is None


class TestHorizon:
    def test_no_later_event_is_capped_at_the_horizon(self):
        gap = free_window([block(at(9), at(10))], at(14))
        assert gap == Gap(at(14), at(14) + HORIZON)

    def test_empty_calendar_is_capped_at_the_horizon(self):
        assert free_window([], at(14)) == Gap(at(14), at(14) + HORIZON)

    def test_next_event_beyond_the_horizon_is_still_capped(self):
        gap = free_window([block(at(23), at(23, 30))], at(14))
        assert gap.end == at(14) + HORIZON

    def test_window_may_cross_midnight(self):
        gap = free_window(
            [],
            at(22),
        )
        assert gap.end == at(22) + HORIZON
        assert gap.end.day == 13


class TestMessyEvents:
    def test_overlapping_events_are_handled(self):
        events = [block(at(15), at(16)), block(at(15, 30), at(17))]
        assert free_window(events, at(14, 10)) == Gap(at(14, 10), at(15))

    def test_event_spanning_midnight_blocks_now(self):
        events = [block(at(23), at(1, day=13))]
        assert free_window(events, at(23, 30)) is None

    def test_past_events_are_ignored(self):
        assert free_window([block(at(8), at(9))], at(14)) == Gap(
            at(14), at(14) + HORIZON
        )

    def test_unsorted_events_are_handled(self):
        events = [block(at(18), at(19)), block(at(15), at(16))]
        assert free_window(events, at(14, 10)).end == at(15)


class TestInputs:
    def test_naive_now_is_rejected(self):
        with pytest.raises(ValueError):
            free_window([], datetime(2026, 11, 12, 14))

    def test_shifted_now_shifts_the_window(self):
        events = [block(at(15), at(16))]
        assert free_window(events, at(14)).start == at(14)
        assert free_window(events, at(14, 30)).start == at(14, 30)

    def test_events_are_not_mutated(self):
        events = [block(at(18), at(19)), block(at(15), at(16))]
        free_window(events, at(14))
        assert [e.start for e in events] == [at(18), at(15)]
