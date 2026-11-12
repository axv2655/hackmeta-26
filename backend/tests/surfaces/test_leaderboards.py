"""S7: pure leaderboard aggregation (service/routes land with T0)."""

from app.services.leaderboards import (
    Ranking,
    eligible_friends,
    my_list,
    top_spots,
)

ME = "me"
FRIENDS = frozenset({"f1", "f2"})


def r(user, mark, score, category="coffee"):
    return Ranking(user_id=user, mark_id=mark, score=score, category=category)


class TestEligibleFriends:
    def test_blocked_friends_are_removed(self):
        assert eligible_friends({"f1", "f2"}, {"f2"}) == frozenset({"f1"})

    def test_no_blocks(self):
        assert eligible_friends({"f1"}, set()) == frozenset({"f1"})


class TestTopSpots:
    def test_non_friends_never_influence_a_score(self):
        base = [r(ME, "kumo", 8.0), r("f1", "kumo", 6.0)]
        with_stranger = [*base, r("stranger", "kumo", 0.0)]
        assert top_spots(with_stranger, ME, FRIENDS) == top_spots(base, ME, FRIENDS)

    def test_a_mark_only_a_stranger_ranked_is_absent(self):
        assert top_spots([r("stranger", "x", 9.0)], ME, FRIENDS) == []

    def test_your_and_friends_scores_are_reported(self):
        rows = top_spots(
            [r(ME, "kumo", 8.0), r("f1", "kumo", 6.0), r("f2", "kumo", 4.0)],
            ME,
            FRIENDS,
        )
        assert len(rows) == 1
        assert rows[0].your_score == 8.0
        assert rows[0].friends_score == 5.0
        assert rows[0].score == 6.0

    def test_mark_ranked_only_by_you_has_no_friends_score(self):
        row = top_spots([r(ME, "kumo", 8.0)], ME, FRIENDS)[0]
        assert row.friends_score is None
        assert row.your_score == 8.0

    def test_mark_ranked_only_by_friends_has_no_your_score(self):
        row = top_spots([r("f1", "kumo", 6.0)], ME, FRIENDS)[0]
        assert row.your_score is None
        assert row.friends_score == 6.0

    def test_sorted_by_combined_score_descending(self):
        rows = top_spots(
            [r(ME, "a", 3.0), r(ME, "b", 9.0), r("f1", "c", 6.0)], ME, FRIENDS
        )
        assert [x.mark_id for x in rows] == ["b", "c", "a"]

    def test_ties_break_by_mark_id_and_are_stable(self):
        rankings = [r(ME, "b", 5.0), r(ME, "a", 5.0), r(ME, "c", 5.0)]
        first = top_spots(rankings, ME, FRIENDS)
        assert [x.mark_id for x in first] == ["a", "b", "c"]
        assert top_spots(list(reversed(rankings)), ME, FRIENDS) == first

    def test_category_filter(self):
        rankings = [r(ME, "kumo", 8.0, "coffee"), r(ME, "gym", 9.0, "climbing")]
        rows = top_spots(rankings, ME, FRIENDS, category="climbing")
        assert [x.mark_id for x in rows] == ["gym"]

    def test_no_category_means_all(self):
        rankings = [r(ME, "kumo", 8.0, "coffee"), r(ME, "gym", 9.0, "climbing")]
        assert len(top_spots(rankings, ME, FRIENDS)) == 2

    def test_empty_rankings_return_an_empty_list(self):
        assert top_spots([], ME, FRIENDS) == []

    def test_with_no_friends_your_own_marks_are_still_listed(self):
        rows = top_spots([r(ME, "a", 5.0)], ME, frozenset())
        assert [x.mark_id for x in rows] == ["a"]

    def test_scores_are_rounded_to_one_decimal(self):
        rows = top_spots(
            [r(ME, "a", 8.0), r("f1", "a", 6.0), r("f2", "a", 5.0)], ME, FRIENDS
        )
        assert rows[0].score == 6.3
        assert rows[0].friends_score == 5.5

    def test_limit_caps_the_rows(self):
        rankings = [r(ME, f"m{i}", float(i)) for i in range(10)]
        assert len(top_spots(rankings, ME, FRIENDS, limit=3)) == 3


class TestMyList:
    def test_only_my_rankings_in_score_order(self):
        rankings = [r(ME, "a", 3.0), r(ME, "b", 9.0), r("f1", "c", 10.0)]
        assert [x.mark_id for x in my_list(rankings, ME)] == ["b", "a"]

    def test_matches_insertion_order_from_ranking_scores(self):
        rankings = [r(ME, "x", 10.0), r(ME, "y", 5.0), r(ME, "z", 0.0)]
        assert [x.mark_id for x in my_list(rankings, ME)] == ["x", "y", "z"]

    def test_category_filter(self):
        rankings = [r(ME, "kumo", 8.0, "coffee"), r(ME, "gym", 9.0, "climbing")]
        assert [x.mark_id for x in my_list(rankings, ME, category="coffee")] == ["kumo"]

    def test_ties_break_by_mark_id(self):
        rankings = [r(ME, "b", 5.0), r(ME, "a", 5.0)]
        assert [x.mark_id for x in my_list(rankings, ME)] == ["a", "b"]

    def test_empty(self):
        assert my_list([], ME) == []
