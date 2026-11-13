"""The friend graph at the service level: signup, profiles, mutual friends,
suggestions, block and unfriend cleanup, renaming and verifying."""

from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.domain.errors import Invalid
from app.repositories.unit_of_work import SqlCoreUnitOfWork
from app.seed.ids import ANISH, PRIYA, TONY
from app.services.accounts import AccountService
from app.services.friends import FriendService, PersonNotFound
from app.services.users import UserService
from app.tables import (
    AutojoinPref,
    Block,
    Circle,
    CircleMember,
    FriendRequest,
    Friendship,
    User,
)
from tests.social.world import NOW, Clock, Inbox, add_move, befriend, build


@pytest.fixture
def inbox() -> Inbox:
    return Inbox()


@pytest.fixture
def friends(session: Session, inbox: Inbox) -> FriendService:
    build(session)
    return FriendService(session, Clock(), inbox)


@pytest.fixture
def users(friends: FriendService, session: Session) -> UserService:
    return UserService(SqlCoreUnitOfWork(session), Clock())


def block(session: Session, user_id: str, hidden_from: str) -> None:
    session.add(Block(user_id=user_id, hidden_from_user_id=hidden_from))
    session.commit()


def circle(session: Session, owner: str, *members: str) -> str:
    row = Circle(owner_id=owner, name=f"{owner}'s crew")
    session.add(row)
    session.flush()
    session.add_all(CircleMember(circle_id=row.id, user_id=m) for m in members)
    session.commit()
    return row.id


def circle_members(session: Session) -> set[tuple[str, str]]:
    rows = session.exec(select(CircleMember, Circle).join(Circle)).all()
    return {(c.owner_id, m.user_id) for m, c in rows}


def autojoins(session: Session) -> set[tuple[str, str]]:
    rows = session.exec(select(AutojoinPref)).all()
    return {(r.user_id, r.other_user_id) for r in rows}


# --- signup -----------------------------------------------------------------


def test_signup_befriends_nobody_and_gets_three_requests(session: Session):
    for uid in (ANISH, PRIYA, TONY, "u_maya"):
        session.add(User(id=uid, name=uid[2:].title(), first_name="X", created_at=NOW))
    session.commit()
    user, _ = AccountService(session, Clock()).signup("Zoe Park", "zoe", "pass1")
    assert session.exec(select(Friendship)).all() == []
    incoming, _ = FriendService(session, Clock(), Inbox()).requests(user.id)
    assert {p.user.id for p in incoming} == {ANISH, PRIYA, TONY}


# --- mutual counts ------------------------------------------------------------


def test_search_and_requests_carry_mutual_counts(friends: FriendService, session):
    found = {p.user.id: p.mutual_count for p in friends.search("ana", "dee")}
    assert found == {"dee": 2}
    session.add(FriendRequest(from_id="dee", to_id="ana", created_at=NOW))
    session.commit()
    incoming, _ = friends.requests("ana")
    assert [(p.user.id, p.username, p.mutual_count) for p in incoming] == [
        ("dee", "deerao", 2)
    ]


# --- profile ------------------------------------------------------------------


def test_profile_shows_relation_mutuals_and_friend_count(friends: FriendService):
    p = friends.profile("ana", "dee")
    assert (p.relation, p.username, p.mutual_count) == ("none", "deerao", 2)
    assert [u.id for u in p.mutual] == ["bo", "cy"]
    assert p.friend_count == 2
    me = friends.profile("ana", "ana")
    assert (me.relation, me.mutual_count, me.friend_count) == ("self", 0, 2)


def test_profile_lists_only_live_moves_the_viewer_can_see(friends, session):
    add_move(session, "m_seen", "bo", ("ana",), joined=("ana",))
    add_move(session, "m_hidden", "bo", ("cy",))
    add_move(session, "m_over", "bo", ("ana",), status="ended")
    add_move(session, "m_other", "cy", ("ana",))
    moves = friends.profile("ana", "bo").moves
    assert [(m.id, m.mark_name, m.my_status) for m in moves] == [
        ("m_seen", "Kumo Matcha", "going")
    ]
    assert not hasattr(moves[0], "lat")


@pytest.mark.parametrize(("owner", "hidden"), [("ana", "dee"), ("dee", "ana")])
def test_profile_is_404_when_blocked_either_way(friends, session, owner, hidden):
    block(session, owner, hidden)
    with pytest.raises(PersonNotFound):
        friends.profile("ana", "dee")


def test_profile_is_404_for_an_unknown_id(friends: FriendService):
    with pytest.raises(PersonNotFound):
        friends.profile("ana", "nobody")


# --- suggestions --------------------------------------------------------------


def test_suggestions_rank_friends_of_friends_then_pad(friends: FriendService, session):
    session.add(FriendRequest(from_id="gus", to_id="ana", created_at=NOW))
    session.add(FriendRequest(from_id="ana", to_id="fay", created_at=NOW))
    block(session, "ana", "hal")
    picks = friends.suggestions("ana", limit=10)
    assert [(p.user.id, p.mutual_count) for p in picks] == [
        ("dee", 2),
        ("eve", 1),
        ("ian", 0),
    ]
    assert {p.relation for p in picks} == {"none"}
    assert picks[0].username == "deerao"


def test_suggestions_respect_the_limit_and_blocks_against_you(friends, session):
    block(session, "dee", "ana")
    assert [p.user.id for p in friends.suggestions("ana", limit=2)] == ["eve", "fay"]


def test_new_account_still_gets_suggestions(friends: FriendService):
    picks = friends.suggestions("ian", limit=3)
    assert [(p.user.id, p.mutual_count) for p in picks] == [
        ("ana", 0),
        ("bo", 0),
        ("cy", 0),
    ]


# --- block and unfriend cleanup -----------------------------------------------


def test_block_cuts_every_tie(users: UserService, session: Session):
    circle(session, "ana", "bo", "cy")
    theirs = circle(session, "bo", "ana")
    session.add_all(
        [
            AutojoinPref(user_id="ana", other_user_id="bo"),
            AutojoinPref(user_id="bo", other_user_id="ana"),
            AutojoinPref(user_id="ana", other_user_id="cy"),
            FriendRequest(from_id="bo", to_id="ana", created_at=NOW),
        ]
    )
    session.commit()
    users.block("ana", "bo")
    assert session.get(Friendship, ("ana", "bo")) is None
    assert session.exec(select(FriendRequest)).all() == []
    assert circle_members(session) == {("ana", "cy"), ("bo", "ana")}
    assert autojoins(session) == {("ana", "cy")}
    assert theirs  # bo's own Circle is untouched: only the blocker's are cleaned
    assert [u.id for u in users.blocked("ana")] == ["bo"]


def test_unfriend_strips_circles_and_autojoin_both_ways(
    friends: FriendService, session: Session
):
    circle(session, "ana", "cy", "bo")
    circle(session, "cy", "ana")
    session.add_all(
        [
            AutojoinPref(user_id="ana", other_user_id="cy"),
            AutojoinPref(user_id="cy", other_user_id="ana"),
        ]
    )
    session.commit()
    friends.unfriend("ana", "cy")
    assert friends.relation("ana", "cy") == "none"
    assert circle_members(session) == {("ana", "bo")}
    assert autojoins(session) == set()


# --- notifications ------------------------------------------------------------


@pytest.mark.anyio
async def test_friend_notifications_deep_link(friends: FriendService, inbox: Inbox):
    await friends.request("fay", "gus")
    await friends.accept("gus", "fay")
    assert [(u, t, d["route"], d["user_id"]) for u, t, d in inbox.sent] == [
        ("gus", "friend_request", "/friends", "fay"),
        ("fay", "friend_accepted", "/user/gus", "gus"),
    ]


# --- profile edits ------------------------------------------------------------


def test_update_profile_trims_and_sets_first_name(users: UserService):
    user = users.update_profile("ana", "  Ana   Maria Lopez ")
    assert (user.name, user.first_name) == ("Ana Maria Lopez", "Ana")
    assert users.get("ana").name == "Ana Maria Lopez"


@pytest.mark.parametrize("name", ["", "   ", "x" * 61])
def test_update_profile_rejects_empty_or_long_names(users: UserService, name: str):
    with pytest.raises(Invalid):
        users.update_profile("ana", name)
    assert users.get("ana").name == "Ana Lopez"


def test_verify_marks_the_account(users: UserService):
    assert users.get("ana").fb_verified is False
    assert users.verify("ana").fb_verified is True
    assert users.get("ana").fb_verified is True


def test_autojoin_rejects_non_friends(users: UserService):
    with pytest.raises(Invalid):
        users.set_autojoin("ana", ["dee"])
    befriend(users.uow.session, "ana", "dee")
    users.uow.session.commit()
    assert [u.id for u in users.set_autojoin("ana", ["dee"])] == ["dee"]
