"""M2: affinity math and the compact Muse context."""

import math

from sqlmodel import Session

from app.domain import affinity
from app.domain.affinity import Features, HangoutFact, Target
from app.muse.context import AliasBook, load_candidates, render_candidates
from app.ports import FreeWindow
from app.tables import CalendarEvent, Move, MoveParticipant, Notification
from tests.muse import factories as f
from tests.muse.factories import T0, days
from tests.muse.fakes import FakeCalendar


def fact(age_days: float, *, category="coffee", bucket="afternoon", mark="kumo"):
    at = T0 - days(age_days)
    return HangoutFact(f"mv{age_days}", mark, category, at.weekday(), bucket, at)


def test_formula_on_hand_built_hangouts() -> None:
    hangouts = [fact(2), fact(10), fact(45, category="food", bucket="lunch")]
    target = Target.at(T0, "coffee", "kumo")  # Thursday afternoon
    feats = affinity.features(hangouts, T0, target, nudges_sent=4, nudges_joined=1)
    assert feats.hangouts_30d == 2 and feats.hangouts_90d == 3
    assert feats.last_hangout_days == 2
    assert feats.same_category == 2 and feats.same_mark == 3
    assert feats.pull_up_rate == 0.25
    expected = (
        3 * math.log1p(2)
        + 1.5 * math.log1p(3)
        + 2 * math.log1p(2)
        + 1.5 * math.log1p(feats.same_slot)
        + 4 * 0.25
        - 0.05 * 2
    )
    assert affinity.score(feats) == round(expected, 3)


def test_same_inputs_same_score_and_never_hung_out_is_penalized() -> None:
    hangouts = [fact(3), fact(20)]
    a = affinity.score(affinity.features(hangouts, T0, Target.at(T0, "coffee")))
    b = affinity.score(affinity.features(list(hangouts), T0, Target.at(T0, "coffee")))
    assert a == b
    assert affinity.score(Features()) == -0.05 * 90
    old = affinity.score(affinity.features([fact(300)], T0))
    assert old == affinity.score(Features(last_hangout_days=300)) == -4.5


def test_close_friends_is_top_quintile_with_ties() -> None:
    counts = {"a": 9, "b": 9, "c": 3, "d": 2, "e": 1, "f": 1, "g": 0}
    assert affinity.close_friends(counts) == {"a", "b"}
    assert affinity.close_friends({}) == frozenset()


def test_hour_buckets_are_local_time() -> None:
    assert affinity.hour_bucket(T0) == "afternoon"  # 20:00 UTC = 2 pm CST
    assert affinity.clock_label(T0) == "2:00"


def test_alias_round_trip_is_lossless() -> None:
    book = AliasBook()
    ids = [f"user_{i}" for i in range(40)]
    aliases = [book.alias(uid, uid.upper()) for uid in ids]
    assert aliases[:3] == ["u1", "u2", "u3"]
    assert [book.id_of(a) for a in aliases] == ids
    assert book.id_of("{u2}") == "user_1" and book.id_of("U2") == "user_1"
    assert book.id_of("u999") is None
    assert book.alias("user_0") == "u1"  # stable


def test_restore_names_after_parsing() -> None:
    people, marks = AliasBook(), AliasBook("k")
    people.alias("u_maya", "Maya")
    people.alias("u_tony", "Tony")
    marks.alias("mk_kumo", "Kumo Matcha")
    text = people.restore("Hey {u1}, {u2}'s at k1 and u2 says hi", marks)
    assert text == "Hey Maya, Tony's at Kumo Matcha and Tony says hi"


def _world(session: Session) -> None:
    f.users(session, "ana", "bo", "cy", "dee", "eve")
    f.mark_row(session, "kumo")
    f.circle(session, "crew", "ana", ["bo", "cy"])
    for i, age in enumerate([1, 5, 12, 40]):
        f.hangout(session, "ana", "bo", move_id=f"h{i}", at=T0 - days(age))
    f.hangout(session, "ana", "cy", move_id="h9", at=T0 - days(60), category="food")
    # ana nudged cy twice for her own Moves; cy joined one.
    for mid in ("m1", "m2"):
        session.add(
            Move(
                id=mid,
                creator_id="ana",
                mark_id="kumo",
                text="x",
                category="coffee",
                starts_at=T0,
                created_at=T0,
            )
        )
        session.add(
            Notification(
                user_id="cy",
                type="move_nudge",
                title="t",
                body="b",
                data={"move_id": mid},
                created_at=T0,
            )
        )
    session.add(
        MoveParticipant(
            move_id="m1", user_id="cy", status="going", joined_via="tap", joined_at=T0
        )
    )
    session.add(
        CalendarEvent(
            user_id="dee",
            title="class",
            starts_at=T0 - days(0.01),
            ends_at=T0 + days(0.05),
        )
    )
    session.commit()


def test_load_candidates_reads_signals(session: Session) -> None:
    _world(session)
    cal = FakeCalendar({"eve": FreeWindow(T0, T0 + days(0.03))})
    cands = load_candidates(
        session,
        "ana",
        ["bo", "cy", "dee", "eve", "ana"],
        T0,
        Target.at(T0, "coffee", "kumo"),
        calendar=cal,
    )
    by_id = {c.user_id: c for c in cands}
    assert set(by_id) == {"bo", "cy", "dee", "eve"}  # never the user themself
    assert cands[0].user_id == "bo"  # most hangouts
    assert by_id["bo"].features.is_close_friend
    assert by_id["bo"].features.shared_circles == 1
    assert by_id["cy"].features.pull_up_rate == 0.5
    assert by_id["dee"].busy and by_id["eve"].features.currently == "free"
    assert by_id["eve"].stretch and not by_id["bo"].stretch


def test_render_truncates_to_25_and_hides_identity(session: Session) -> None:
    uids = [f"p{i:02d}" for i in range(30)]
    f.users(session, "ana", *uids)
    for i, uid in enumerate(uids):
        for k in range(i % 5):
            f.hangout(session, "ana", uid, move_id=f"{uid}{k}", at=T0 - days(k + 1))
    session.commit()
    cands = load_candidates(session, "ana", uids, T0)
    book = AliasBook()
    text, shown = render_candidates(cands, book, first=["p00"])
    assert len(shown) == 25 and len(text.splitlines()) == 26
    assert "p00" in {c.user_id for c in shown}  # forced row survives truncation
    assert "p0" not in text.replace("|", " ").split()  # ids never rendered
    assert "P00" not in text  # names never rendered
    assert book.id_of("u1") == "p00"
