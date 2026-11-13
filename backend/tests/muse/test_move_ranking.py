"""Pairwise Move ranking domain (domain/move_ranking.py): pure, no database."""

import itertools
import random

from app.domain.move_ranking import MoveFacts, prefer, rank, score, top_factor


def facts(mid: str, **kw) -> MoveFacts:
    return MoveFacts(move_id=mid, **kw)


POOL = [
    facts("a", best_affinity=7.0, close_count=2, going=3, age_minutes=20),
    facts("b", best_affinity=1.0, close_count=1, going=1, age_minutes=5),
    facts("c", place_score=9.0, going=4, age_minutes=60),
    facts("d", taste_fit=True, minutes_left=4, going=1, age_minutes=10),
    facts("e", place_score=2.0, going=1, age_minutes=200),
    facts("f", going=2, age_minutes=30),
    facts("g", going=2, age_minutes=30),  # exact tie with f: id decides
]


def test_prefer_is_a_strict_total_order() -> None:
    for x, y in itertools.permutations(POOL, 2):
        assert prefer(x, y) != prefer(y, x)  # antisymmetric, never "the same"
    for x, y, z in itertools.permutations(POOL, 3):
        if prefer(x, y) and prefer(y, z):
            assert prefer(x, z)  # transitive


def test_binary_insertion_matches_every_pairwise_answer() -> None:
    ranked = rank(POOL)
    for i, j in itertools.combinations(range(len(ranked)), 2):
        assert prefer(ranked[i], ranked[j])


def test_input_order_never_changes_the_result() -> None:
    expected = rank(POOL)
    for seed in range(20):
        pool = list(POOL)
        random.Random(seed).shuffle(pool)
        assert rank(pool) == expected


def test_ties_break_newest_then_id() -> None:
    old = facts("z", going=2, age_minutes=90)
    new = facts("y", going=2, age_minutes=90)
    assert score(old) == score(new)
    assert [m.move_id for m in rank([old, new])] == ["y", "z"]
    newer = facts("x", going=2, age_minutes=10)
    assert prefer(newer, facts("w", going=2, age_minutes=11))


def test_each_factor_pushes_the_right_way() -> None:
    base = facts("m", going=1, age_minutes=60)
    better = [
        facts("m", best_affinity=5.0, close_count=1, going=1, age_minutes=60),
        facts("m", place_score=9.0, going=1, age_minutes=60),
        facts("m", taste_fit=True, going=1, age_minutes=60),
        facts("m", minutes_left=5, going=1, age_minutes=60),
        facts("m", going=6, age_minutes=60),
        facts("m", going=1, age_minutes=1),
    ]
    for b in better:
        assert score(b) > score(base), b
    assert score(facts("m", place_score=1.0, going=1, age_minutes=60)) < score(base)


def test_top_factor_names_the_reason_or_none() -> None:
    assert top_factor(POOL[0]) == "people"
    assert top_factor(POOL[2]) == "place"
    assert top_factor(POOL[3]) == "taste"
    assert top_factor(facts("q", age_minutes=999)) is None
