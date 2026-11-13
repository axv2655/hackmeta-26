"""S6: pure pairwise-ranking domain tests (service tests: test_ratings_routes.py)."""

import pytest

from app.domain.errors import Invalid
from app.domain.ranking import (
    BANDS,
    AlreadyRanked,
    Comparison,
    Face,
    StaleComparison,
    apply,
    face_for,
    next_comparison,
)


def rank(ranked, new, face, prefer_new):
    """Drive next_comparison/apply the way the service will.

    prefer_new(other) -> True if the user prefers the new Mark over `other`.
    """
    answers: list[Comparison] = []
    while (other := next_comparison(ranked, new, answers)) is not None:
        preferred = new if prefer_new(other) else other
        answers = [*answers, Comparison(other=other, preferred=preferred)]
    return apply(ranked, new, face, answers), answers


def order(result):
    return [mark for mark, _ in result]


def scores(result):
    return [score for _, score in result]


class TestEmptyList:
    def test_no_comparison_needed(self):
        assert next_comparison([], "a", []) is None

    def test_single_mark_gets_top_of_face_band(self):
        for face in Face:
            result = apply([], "a", face, [])
            assert result == [("a", BANDS[face][1])]


class TestInsertion:
    RANKED = ["a", "b", "c", "d", "e"]

    def test_insert_at_top(self):
        result, _ = rank(self.RANKED, "n", Face.LOVED, lambda other: True)
        assert order(result) == ["n", *self.RANKED]

    def test_insert_at_bottom(self):
        result, _ = rank(self.RANKED, "n", Face.NOT_FOR_US, lambda other: False)
        assert order(result) == [*self.RANKED, "n"]

    def test_insert_in_middle(self):
        better_than = {"c", "d", "e"}
        result, _ = rank(self.RANKED, "n", Face.FINE, lambda o: o in better_than)
        assert order(result) == ["a", "b", "n", "c", "d", "e"]

    def test_comparison_count_is_logarithmic(self):
        ranked = [f"m{i}" for i in range(16)]
        _, answers = rank(ranked, "n", Face.FINE, lambda other: False)
        assert len(answers) <= 5

    def test_existing_order_is_preserved(self):
        result, _ = rank(self.RANKED, "n", Face.FINE, lambda o: o in {"d", "e"})
        assert [m for m in order(result) if m != "n"] == self.RANKED

    def test_input_list_is_not_mutated(self):
        ranked = list(self.RANKED)
        rank(ranked, "n", Face.FINE, lambda other: True)
        assert ranked == self.RANKED

    def test_tie_places_new_mark_just_below_the_tied_one(self):
        other = next_comparison(self.RANKED, "n", [])
        answers = [Comparison(other=other, preferred=None)]
        result = apply(self.RANKED, "n", Face.FINE, answers)
        assert order(result).index("n") == self.RANKED.index(other) + 1


class TestScores:
    def test_scores_strictly_decrease_and_stay_in_range(self):
        for n in range(1, 40):
            ranked = [f"m{i}" for i in range(n)]
            result, _ = rank(ranked, "n", Face.FINE, lambda other: False)
            s = scores(result)
            assert all(a > b for a, b in zip(s, s[1:], strict=False))
            assert all(0.0 <= x <= 10.0 for x in s)

    def test_loved_new_mark_lands_in_loved_band(self):
        ranked = [f"m{i}" for i in range(9)]
        result, _ = rank(ranked, "n", Face.LOVED, lambda other: False)
        score = dict(result)["n"]
        low, high = BANDS[Face.LOVED]
        assert low <= score <= high

    def test_not_for_us_new_mark_lands_in_its_band_even_if_user_ranks_it_top(self):
        ranked = [f"m{i}" for i in range(9)]
        result, _ = rank(ranked, "n", Face.NOT_FOR_US, lambda other: True)
        low, high = BANDS[Face.NOT_FOR_US]
        assert low <= dict(result)["n"] <= high

    def test_apply_is_deterministic(self):
        ranked = ["a", "b", "c"]
        first, answers = rank(ranked, "n", Face.FINE, lambda o: o == "c")
        assert apply(ranked, "n", Face.FINE, answers) == first


class TestInvalidInput:
    def test_errors_are_domain_invalid(self):
        assert issubclass(StaleComparison, Invalid)
        assert issubclass(AlreadyRanked, Invalid)

    def test_new_mark_already_ranked_is_rejected(self):
        with pytest.raises(AlreadyRanked):
            apply(["a", "b"], "a", Face.FINE, [])

    def test_answer_about_a_mark_not_asked_is_rejected(self):
        ranked = ["a", "b", "c"]
        asked = next_comparison(ranked, "n", [])
        wrong = next(m for m in ranked if m != asked)
        with pytest.raises(StaleComparison):
            apply(ranked, "n", Face.FINE, [Comparison(other=wrong, preferred="n")])

    def test_preferred_must_be_one_of_the_pair(self):
        ranked = ["a", "b", "c"]
        asked = next_comparison(ranked, "n", [])
        with pytest.raises(StaleComparison):
            apply(ranked, "n", Face.FINE, [Comparison(other=asked, preferred="zzz")])

    def test_too_many_answers_are_rejected(self):
        ranked = ["a"]
        asked = next_comparison(ranked, "n", [])
        answers = [Comparison(other=asked, preferred="n")] * 3
        with pytest.raises(StaleComparison):
            apply(ranked, "n", Face.FINE, answers)


def build(faces_in_order):
    """Grow a list the way the service does, one rating at a time, always
    answering 'new is better' so the face alone decides the place."""
    items: list[tuple[str, float]] = []
    for i, face in enumerate(faces_in_order):
        ranked = [m for m, _ in items]
        scores = dict(items)
        new = f"n{i}"
        answers: list[Comparison] = []
        while (other := next_comparison(ranked, new, answers)) is not None:
            answers = [*answers, Comparison(other=other, preferred=new)]
        items = apply(ranked, new, face, answers, scores)
    return items


class TestFaceBands:
    FACES = [Face.FINE, Face.LOVED, Face.NOT_FOR_US, Face.LOVED, Face.FINE] * 4

    def test_every_score_stays_in_its_face_band_after_inserts(self):
        faces = {f"n{i}": f for i, f in enumerate(self.FACES)}
        for mark, score in build(self.FACES):
            low, high = BANDS[faces[mark]]
            assert low <= score <= high, (mark, score)

    def test_faces_are_grouped_best_first_and_scores_decrease(self):
        items = build(self.FACES)
        s = [score for _, score in items]
        assert all(a > b for a, b in zip(s, s[1:], strict=False))
        order_of = [Face.LOVED, Face.FINE, Face.NOT_FOR_US]
        ranks = [order_of.index(face_for(score)) for score in s]
        assert ranks == sorted(ranks)

    def test_scores_spread_evenly_inside_a_band(self):
        items = build([Face.LOVED] * 4)
        assert [score for _, score in items] == [10.0, 9.0, 8.0, 7.0]

    def test_loved_mark_cannot_drop_below_existing_fine_marks(self):
        ranked = ["a", "b"]
        scores = {"a": 6.9, "b": 4.0}
        asked = next_comparison(ranked, "n", [])
        answers = [
            Comparison(other=asked, preferred=asked)
        ]  # user prefers the Fine one
        result = apply(ranked, "n", Face.LOVED, answers, scores)
        assert order(result)[0] == "n"
        assert dict(result)["n"] == 10.0

    def test_tie_maps_to_place_just_below(self):
        ranked = ["a", "b", "c"]
        scores = {"a": 6.9, "b": 5.5, "c": 4.0}
        asked = next_comparison(ranked, "n", [])
        result = apply(
            ranked, "n", Face.FINE, [Comparison(other=asked, preferred=None)], scores
        )
        assert order(result).index("n") == ranked.index(asked) + 1
