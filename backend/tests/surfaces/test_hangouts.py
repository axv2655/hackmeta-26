"""S8: pure hangout rules (handler/notify wiring lands with T0)."""

from datetime import UTC, datetime

from app.services.hangouts import (
    Presence,
    hangout_bucket,
    overlapping_pairs,
    rating_recipients,
)


def at(hour, minute=0, day=12):
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


END = at(18)


class TestOverlappingPairs:
    def test_two_attendees_make_one_pair(self):
        people = [Presence("a", at(12), at(13)), Presence("b", at(12), at(13))]
        assert overlapping_pairs(people, END) == [("a", "b")]

    def test_three_attendees_make_three_pairs(self):
        people = [Presence(u, at(12), at(13)) for u in "abc"]
        assert overlapping_pairs(people, END) == [("a", "b"), ("a", "c"), ("b", "c")]

    def test_four_attendees_make_six_pairs(self):
        people = [Presence(u, at(12), at(13)) for u in "abcd"]
        assert len(overlapping_pairs(people, END)) == 6

    def test_one_attendee_makes_no_pair(self):
        assert overlapping_pairs([Presence("a", at(12), at(13))], END) == []

    def test_no_attendees_make_no_pair(self):
        assert overlapping_pairs([], END) == []

    def test_people_who_never_overlapped_make_no_pair(self):
        people = [Presence("a", at(12), at(13)), Presence("b", at(14), at(15))]
        assert overlapping_pairs(people, END) == []

    def test_touching_intervals_do_not_overlap(self):
        people = [Presence("a", at(12), at(13)), Presence("b", at(13), at(14))]
        assert overlapping_pairs(people, END) == []

    def test_partial_overlap_counts(self):
        people = [Presence("a", at(12), at(14)), Presence("b", at(13), at(15))]
        assert overlapping_pairs(people, END) == [("a", "b")]

    def test_still_there_at_end_uses_the_move_end(self):
        people = [Presence("a", at(12), None), Presence("b", at(17), None)]
        assert overlapping_pairs(people, END) == [("a", "b")]

    def test_still_there_after_the_other_left_does_not_overlap(self):
        people = [Presence("a", at(12), at(13)), Presence("b", at(14), None)]
        assert overlapping_pairs(people, END) == []

    def test_pair_members_are_sorted_and_result_is_deterministic(self):
        people = [Presence("z", at(12), at(13)), Presence("a", at(12), at(13))]
        assert overlapping_pairs(people, END) == [("a", "z")]

    def test_duplicate_presence_rows_for_one_user_do_not_self_pair(self):
        people = [Presence("a", at(12), at(13)), Presence("a", at(12, 30), at(14))]
        assert overlapping_pairs(people, END) == []

    def test_same_pair_via_two_intervals_is_reported_once(self):
        people = [
            Presence("a", at(12), at(13)),
            Presence("a", at(15), at(16)),
            Presence("b", at(12, 30), at(15, 30)),
        ]
        assert overlapping_pairs(people, END) == [("a", "b")]

    def test_input_is_not_mutated(self):
        people = [Presence("b", at(12), at(13)), Presence("a", at(12), at(13))]
        overlapping_pairs(people, END)
        assert [p.user_id for p in people] == ["b", "a"]


class TestRatingRecipients:
    def test_everyone_who_was_there_is_prompted_once(self):
        people = [
            Presence("a", at(12), at(13)),
            Presence("a", at(14), at(15)),
            Presence("b", at(12), None),
        ]
        assert rating_recipients(people) == ["a", "b"]

    def test_lone_attendee_is_still_prompted(self):
        assert rating_recipients([Presence("a", at(12), at(13))]) == ["a"]

    def test_empty(self):
        assert rating_recipients([]) == []


class TestHangoutBucket:
    def test_weekday_and_hour(self):
        # 2026-11-12 is a Thursday (weekday 3)
        assert hangout_bucket(at(15, 40)) == (3, 15)

    def test_midnight_rolls_the_weekday(self):
        assert hangout_bucket(at(23, 59)) == (3, 23)
        assert hangout_bucket(at(0, 0, day=13)) == (4, 0)

    def test_naive_datetime_is_rejected(self):
        import pytest

        with pytest.raises(ValueError):
            hangout_bucket(datetime(2026, 11, 12, 15))
