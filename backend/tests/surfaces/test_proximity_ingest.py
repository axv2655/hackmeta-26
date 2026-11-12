"""S1: pure proximity rules and cluster math (ingest/routes land with T0)."""

from datetime import UTC, datetime, timedelta

from app.services.proximity import (
    COPRESENCE_WINDOW,
    PURGE_AGE,
    RSSI_MIN,
    TOKEN_TTL,
    cluster_of,
    is_copresent,
    is_purgeable,
    is_token_valid,
    keep_sighting,
    pair_key,
)

NOW = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)


class TestRssiFilter:
    def test_threshold_is_minus_75(self):
        assert RSSI_MIN == -75

    def test_at_threshold_is_kept(self):
        assert keep_sighting(-75)

    def test_stronger_is_kept(self):
        assert keep_sighting(-40)

    def test_weaker_is_dropped(self):
        assert not keep_sighting(-76)


class TestTokenExpiry:
    def test_ttl_is_fifteen_minutes(self):
        assert TOKEN_TTL == timedelta(minutes=15)

    def test_valid_just_before_expiry(self):
        assert is_token_valid(NOW - timedelta(minutes=14, seconds=59), NOW)

    def test_expired_at_exactly_ttl(self):
        assert not is_token_valid(NOW - TOKEN_TTL, NOW)

    def test_future_issue_time_is_invalid(self):
        assert not is_token_valid(NOW + timedelta(seconds=1), NOW)


class TestCopresenceWindow:
    def test_window_is_sixty_seconds(self):
        assert COPRESENCE_WINDOW == timedelta(seconds=60)

    def test_copresent_at_sixty_seconds(self):
        assert is_copresent(NOW - timedelta(seconds=60), NOW)

    def test_not_copresent_at_sixty_one_seconds(self):
        assert not is_copresent(NOW - timedelta(seconds=61), NOW)

    def test_future_sighting_is_not_copresent(self):
        assert not is_copresent(NOW + timedelta(seconds=5), NOW)


class TestPurge:
    def test_purge_age_is_two_hours(self):
        assert PURGE_AGE == timedelta(hours=2)

    def test_exactly_two_hours_is_kept(self):
        assert not is_purgeable(NOW - PURGE_AGE, NOW)

    def test_older_than_two_hours_is_purged(self):
        assert is_purgeable(NOW - PURGE_AGE - timedelta(seconds=1), NOW)


class TestPairKey:
    def test_order_does_not_matter(self):
        assert pair_key("b", "a") == pair_key("a", "b") == ("a", "b")

    def test_self_pair_is_rejected(self):
        import pytest

        with pytest.raises(ValueError):
            pair_key("a", "a")


class TestCluster:
    def test_user_with_no_pairs_is_alone(self):
        assert cluster_of("a", []) == frozenset({"a"})

    def test_direct_pair(self):
        assert cluster_of("a", [("a", "b")]) == frozenset({"a", "b"})

    def test_chain_of_three_is_one_cluster(self):
        pairs = [("a", "b"), ("b", "c")]
        assert cluster_of("a", pairs) == frozenset({"a", "b", "c"})
        assert cluster_of("c", pairs) == frozenset({"a", "b", "c"})

    def test_disjoint_groups_stay_separate(self):
        pairs = [("a", "b"), ("c", "d")]
        assert cluster_of("a", pairs) == frozenset({"a", "b"})
        assert cluster_of("d", pairs) == frozenset({"c", "d"})

    def test_pair_direction_does_not_matter(self):
        assert cluster_of("a", [("b", "a")]) == frozenset({"a", "b"})

    def test_cycle_terminates(self):
        pairs = [("a", "b"), ("b", "c"), ("c", "a")]
        assert cluster_of("b", pairs) == frozenset({"a", "b", "c"})

    def test_duplicate_pairs_are_harmless(self):
        assert cluster_of("a", [("a", "b"), ("b", "a")]) == frozenset({"a", "b"})
