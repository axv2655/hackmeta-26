"""Move domain (core C3): participant state machine, end rules, staleness."""

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from app.domain import moves as domain
from app.domain.errors import (
    EndNotAllowed,
    IllegalTransition,
    InvalidMove,
    MoveNotLive,
    MoveNotOpen,
    NotMoveCreator,
    NotParticipant,
    UnverifiedOpenMove,
)
from app.ports import (
    EndReason,
    JoinedVia,
    MarkSnapshot,
    MoveCreate,
    MoveSnapshot,
    MoveStatus,
    ParticipantSnapshot,
    ParticipantStatus,
)

T0 = datetime(2026, 11, 12, 14, 0, tzinfo=UTC)
LATER = T0 + timedelta(minutes=20)
Rule = Callable[[MoveSnapshot, str, datetime], ParticipantSnapshot | None]
MARK = MarkSnapshot(
    id="kumo", name="Kumo", category="coffee", lat=1.0, lng=2.0, address=""
)


def _p(
    user_id: str,
    status: ParticipantStatus = "going",
    via: JoinedVia = "tap",
    at: datetime = T0,
) -> ParticipantSnapshot:
    return ParticipantSnapshot(
        user_id=user_id,
        status=status,
        joined_via=via,
        joined_at=at,
        arrived_at=at if status == "there" else None,
        left_at=at if status == "left" else None,
    )


def _move(*participants: ParticipantSnapshot, **changes: object) -> MoveSnapshot:
    move = MoveSnapshot(
        id="m1",
        creator_id="ana",
        mark=MARK,
        text="matcha?",
        category="coffee",
        status="live",
        kind="move",
        open=False,
        origin="manual",
        starts_at=T0,
        created_at=T0,
        participants=(_p("ana", "there", "creator"), *participants),
    )
    return replace(move, **changes)


# --- plan_move -----------------------------------------------------------------


class TestPlanMove:
    def test_builds_new_move_starting_now(self) -> None:
        draft = MoveCreate(
            mark_id="kumo",
            text="  matcha?  ",
            category="coffee",
            open=True,
            origin="reel",
            origin_ref="r1",
            notify_user_ids=("bo",),
        )
        new = domain.plan_move("ana", draft, T0)
        assert new.text == "matcha?"
        assert new.starts_at == T0
        assert new.fill_deadline is None
        assert (new.open, new.origin, new.origin_ref) == (True, "reel", "r1")
        assert new.notify_user_ids == ("bo",)
        assert new.creator == ParticipantSnapshot(
            user_id="ana", status="going", joined_via="creator", joined_at=T0
        )

    def test_creator_inside_geofence_starts_there(self) -> None:
        draft = MoveCreate(mark_id="k", text="x", category="food", creator_there=True)
        creator = domain.plan_move("ana", draft, T0).creator
        assert (creator.status, creator.arrived_at) == ("there", T0)

    @pytest.mark.parametrize("minutes", [5, 10])
    def test_fill_window_sets_deadline(self, minutes: int) -> None:
        draft = MoveCreate(
            mark_id="k", text="x", category="food", kind="flare", fill_minutes=minutes
        )
        new = domain.plan_move("ana", draft, T0)
        assert new.fill_deadline == T0 + timedelta(minutes=minutes)

    @pytest.mark.parametrize("minutes", [0, 4, 11, -5])
    def test_fill_window_out_of_range(self, minutes: int) -> None:
        draft = MoveCreate(mark_id="k", text="x", category="food", fill_minutes=minutes)
        with pytest.raises(InvalidMove):
            domain.plan_move("ana", draft, T0)

    def test_flare_needs_fill_window(self) -> None:
        draft = MoveCreate(mark_id="k", text="x", category="food", kind="flare")
        with pytest.raises(InvalidMove):
            domain.plan_move("ana", draft, T0)

    @pytest.mark.parametrize(
        ("open_", "verified", "allowed"),
        [(True, True, True), (True, False, False), (False, False, True)],
    )
    def test_only_verified_users_post_open_moves(
        self, open_: bool, verified: bool, allowed: bool
    ) -> None:
        draft = MoveCreate(mark_id="k", text="x", category="food", open=open_)
        if allowed:
            domain.require_may_post(draft, creator_verified=verified)
        else:
            with pytest.raises(UnverifiedOpenMove):
                domain.require_may_post(draft, creator_verified=verified)

    @pytest.mark.parametrize("text", ["", "   ", "x" * 281])
    def test_bad_text(self, text: str) -> None:
        with pytest.raises(InvalidMove):
            domain.validate_text(text)

    def test_text_at_limit(self) -> None:
        assert domain.validate_text("x" * 280) == "x" * 280


# --- join ----------------------------------------------------------------------


class TestJoin:
    @pytest.mark.parametrize(
        ("via", "status"),
        [
            ("tap", "going"),
            ("ble_prompt", "there"),
            ("ble_auto", "there"),
            ("open_ble", "going"),
            ("open_ble", "there"),
        ],
    )
    def test_new_participant(self, via: JoinedVia, status: ParticipantStatus) -> None:
        joined = domain.join(_move(open=True), "bo", status, via, LATER)
        assert joined == ParticipantSnapshot(
            user_id="bo",
            status=status,
            joined_via=via,
            joined_at=LATER,
            arrived_at=LATER if status == "there" else None,
        )

    @pytest.mark.parametrize(
        ("via", "status"),
        [
            ("tap", "there"),
            ("tap", "left"),
            ("ble_prompt", "going"),
            ("ble_auto", "going"),
            ("open_ble", "left"),
            ("creator", "going"),
        ],
    )
    def test_forbidden_entry(self, via: JoinedVia, status: ParticipantStatus) -> None:
        with pytest.raises(IllegalTransition):
            domain.join(_move(open=True), "bo", status, via, LATER)

    def test_open_ble_needs_open_move(self) -> None:
        with pytest.raises(MoveNotOpen):
            domain.join(_move(), "bo", "there", "open_ble", LATER)

    @pytest.mark.parametrize(
        ("current", "requested", "via"),
        [
            ("going", "going", "tap"),
            ("there", "going", "tap"),
            ("there", "there", "ble_auto"),
        ],
    )
    def test_rejoin_is_idempotent(
        self, current: ParticipantStatus, requested: ParticipantStatus, via: JoinedVia
    ) -> None:
        move = _move(_p("bo", current))
        assert domain.join(move, "bo", requested, via, LATER) is None

    def test_creator_rejoin_is_noop(self) -> None:
        assert domain.join(_move(), "ana", "there", "creator", LATER) is None

    def test_ble_join_while_going_arrives(self) -> None:
        joined = domain.join(_move(_p("bo")), "bo", "there", "ble_prompt", LATER)
        assert joined == replace(_p("bo"), status="there", arrived_at=LATER)

    @pytest.mark.parametrize("requested", ["going", "there"])
    def test_rejoin_after_leaving(self, requested: ParticipantStatus) -> None:
        move = _move(_p("bo", "left"), open=True)
        with pytest.raises(IllegalTransition):
            domain.join(move, "bo", requested, "open_ble", LATER)

    @pytest.mark.parametrize("status", ["ended", "cancelled"])
    def test_needs_live_move(self, status: MoveStatus) -> None:
        with pytest.raises(MoveNotLive):
            domain.join(_move(status=status), "bo", "going", "tap", LATER)


# --- arrive / leave ------------------------------------------------------------


class TestArriveLeave:
    def test_arrive_from_going(self) -> None:
        arrived = domain.arrive(_move(_p("bo")), "bo", LATER)
        assert arrived == replace(_p("bo"), status="there", arrived_at=LATER)

    def test_arrive_again_is_noop(self) -> None:
        assert domain.arrive(_move(_p("bo", "there")), "bo", LATER) is None

    def test_arrive_after_leaving(self) -> None:
        with pytest.raises(IllegalTransition):
            domain.arrive(_move(_p("bo", "left")), "bo", LATER)

    @pytest.mark.parametrize("status", ["going", "there"])
    def test_leave(self, status: ParticipantStatus) -> None:
        before = _p("bo", status)
        left = domain.leave(_move(before), "bo", LATER)
        assert left == replace(before, status="left", left_at=LATER)

    def test_leave_again_is_noop(self) -> None:
        assert domain.leave(_move(_p("bo", "left")), "bo", LATER) is None

    @pytest.mark.parametrize("rule", [domain.arrive, domain.leave])
    def test_needs_participant(self, rule: Rule) -> None:
        with pytest.raises(NotParticipant):
            rule(_move(), "bo", LATER)

    @pytest.mark.parametrize("rule", [domain.arrive, domain.leave])
    def test_needs_live_move(self, rule: Rule) -> None:
        with pytest.raises(MoveNotLive):
            rule(_move(_p("bo"), status="ended"), "bo", LATER)


# --- helpers -------------------------------------------------------------------


class TestHelpers:
    def test_with_participant_replaces_and_inserts(self) -> None:
        move = _move(_p("bo"))
        updated = domain.with_participant(move, _p("bo", "left"))
        assert domain.participant(updated, "bo") == _p("bo", "left")
        added = domain.with_participant(move, _p("cy"))
        assert [p.user_id for p in added.participants] == ["ana", "bo", "cy"]

    def test_everyone_left(self) -> None:
        assert not domain.everyone_left(_move(participants=()))
        assert not domain.everyone_left(_move(_p("bo", "left")))
        left = _move(_p("bo", "left"), participants=(_p("ana", "left"),))
        assert domain.everyone_left(left)

    def test_has_joiners(self) -> None:
        assert not domain.has_joiners(_move())
        assert domain.has_joiners(_move(_p("bo", "left")))


# --- staleness -----------------------------------------------------------------


class TestStale:
    def test_boundary_from_start(self) -> None:
        move = _move()
        just_before = T0 + timedelta(hours=3) - timedelta(seconds=1)
        assert not domain.is_stale(move, just_before)
        assert domain.is_stale(move, T0 + timedelta(hours=3))
        assert domain.is_stale(move, T0 + timedelta(hours=5))

    @pytest.mark.parametrize("stamp", ["joined_at", "arrived_at", "left_at"])
    def test_activity_resets_the_window(self, stamp: str) -> None:
        late = T0 + timedelta(hours=2)
        bo = replace(_p("bo", at=T0), **{stamp: late})
        move = _move(bo)
        assert domain.last_activity(move) == late
        assert not domain.is_stale(move, T0 + timedelta(hours=3))
        assert domain.is_stale(move, late + timedelta(hours=3))

    @pytest.mark.parametrize("status", ["ended", "cancelled"])
    def test_finished_move_is_never_stale(self, status: MoveStatus) -> None:
        later = T0 + timedelta(hours=10)
        assert not domain.is_stale(_move(status=status), later)

    def test_stale_cutoff(self) -> None:
        assert domain.stale_cutoff(T0) == T0 - timedelta(hours=3)


# --- end -----------------------------------------------------------------------


class TestEnd:
    def test_creator_ends(self) -> None:
        ended = domain.end(_move(_p("bo")), "creator", LATER, actor_id="ana")
        assert (ended.status, ended.ends_at) == ("ended", LATER)

    @pytest.mark.parametrize("actor", ["bo", None])
    def test_only_creator_ends_by_hand(self, actor: str | None) -> None:
        with pytest.raises(NotMoveCreator):
            domain.end(_move(_p("bo")), "creator", LATER, actor_id=actor)

    def test_everyone_left(self) -> None:
        move = _move(_p("bo", "left"), participants=(_p("ana", "left"),))
        assert domain.end(move, "everyone_left", LATER).status == "ended"

    def test_everyone_left_needs_everyone_gone(self) -> None:
        with pytest.raises(EndNotAllowed):
            domain.end(_move(_p("bo", "left")), "everyone_left", LATER)

    def test_stale(self) -> None:
        at = T0 + timedelta(hours=3)
        assert domain.end(_move(), "stale", at).ends_at == at

    def test_stale_needs_quiet_window(self) -> None:
        with pytest.raises(EndNotAllowed):
            domain.end(_move(), "stale", T0 + timedelta(hours=2))

    def test_nobody_bit_cancels(self) -> None:
        ended = domain.end(_move(), "nobody_bit", LATER)
        assert (ended.status, ended.ends_at) == ("cancelled", LATER)

    def test_nobody_bit_needs_no_joiners(self) -> None:
        with pytest.raises(EndNotAllowed):
            domain.end(_move(_p("bo", "left")), "nobody_bit", LATER)

    @pytest.mark.parametrize("status", ["ended", "cancelled"])
    @pytest.mark.parametrize(
        "reason", ["creator", "everyone_left", "stale", "nobody_bit"]
    )
    def test_cannot_end_twice(self, status: MoveStatus, reason: EndReason) -> None:
        move = _move(status=status, participants=())
        with pytest.raises(MoveNotLive):
            domain.end(move, reason, T0 + timedelta(hours=5), actor_id="ana")
