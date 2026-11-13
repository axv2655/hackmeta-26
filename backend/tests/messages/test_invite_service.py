"""InviteService use cases, with fake ports and an in-memory database."""

import pytest
from sqlmodel import Session, select

from app.container import Container
from app.domain.invites import (
    InvalidInvite,
    InviteMoveGone,
    InviteNotAllowed,
    InviteNotFound,
)
from app.services.invites import InviteService
from app.tables import MoveInvite, User
from tests.messages.fakes import (
    FakeMoves,
    FixedClock,
    RecordingNotifier,
    add_world,
    kumo_move,
)

pytestmark = pytest.mark.anyio

BASE = "https://moves.test"


@pytest.fixture
def container(session: Session) -> Container:
    add_world(session)
    c = Container()
    c.clock = FixedClock()
    c.moves = FakeMoves(
        moves={"m1": kumo_move(participants=("ana", "bo"))},
        audiences={"m1": frozenset({"bo"})},
    )
    c.notifier = RecordingNotifier()
    return c


def user(session: Session, user_id: str) -> User:
    found = session.get(User, user_id)
    assert found is not None
    return found


def test_each_share_gets_its_own_link(session: Session, container: Container) -> None:
    service = InviteService(session, container)
    one = service.create(user(session, "ana"), "m1", None, BASE)
    two = service.create(user(session, "ana"), "m1", None, BASE)
    assert one.url != two.url and one.url.startswith(f"{BASE}/m/")
    assert one.text == "Ana is making a move to Kumo Matcha. You want to pull up?"
    assert one.body == f"{one.text}\n{one.url}"


def test_custom_line_and_sharing_someone_elses_move(
    session: Session, container: Container
) -> None:
    service = InviteService(session, container)
    assert service.create(user(session, "ana"), "m1", "yo", BASE).text == "yo"
    by_bo = service.create(user(session, "bo"), "m1", None, BASE)
    assert by_bo.text == "Bo: Ana is making a move to Kumo Matcha. You want to pull up?"


def test_only_people_who_can_see_the_move_can_share_it(
    session: Session, container: Container
) -> None:
    service = InviteService(session, container)
    with pytest.raises(InviteNotAllowed):
        service.create(user(session, "dee"), "m1", None, BASE)
    with pytest.raises(InviteMoveGone):
        service.create(user(session, "ana"), "nope", None, BASE)
    container.moves.end("m1")
    with pytest.raises(InviteMoveGone):
        service.create(user(session, "ana"), "m1", None, BASE)


def test_creator_sees_every_link_others_see_their_own(
    session: Session, container: Container
) -> None:
    service = InviteService(session, container)
    service.create(user(session, "ana"), "m1", None, BASE)
    service.create(user(session, "bo"), "m1", None, BASE)
    assert len(service.list_for(user(session, "ana"), "m1", BASE)) == 2
    assert len(service.list_for(user(session, "bo"), "m1", BASE)) == 1


def test_page_counts_real_opens_only(session: Session, container: Container) -> None:
    service = InviteService(session, container)
    token = service.create(user(session, "ana"), "m1", None, BASE).token
    service.page(token, count_open=False)  # iMessage building its preview
    page = service.page(token, count_open=True)
    assert page.live and page.mark_name == "Kumo Matcha"
    assert page.hosts == ("Ana",) and page.others_count == 1  # Bo, unnamed
    row = session.exec(select(MoveInvite)).one()
    assert row.open_count == 1 and row.opened_at is not None
    with pytest.raises(InviteNotFound):
        service.page("missing", count_open=True)


async def test_guest_going_tells_sharer_and_creator_once(
    session: Session, container: Container
) -> None:
    service = InviteService(session, container)
    token = service.create(user(session, "bo"), "m1", None, BASE).token
    page = await service.going(token, "  Sam  ")
    assert page.guest_name == "Sam"
    assert page.hosts == ("Ana", "Bo") and page.others_count == 0
    await service.going(token, "Sam")
    sent = container.notifier.sent
    assert [(s[0], s[1], s[2]) for s in sent] == [
        ("bo", "joined_your_move", "Sam is pulling up"),
        ("ana", "joined_your_move", "Sam is pulling up"),
    ]
    assert sent[0][4]["route"] == "/move/m1"


async def test_guest_needs_a_name_and_a_live_move(
    session: Session, container: Container
) -> None:
    service = InviteService(session, container)
    token = service.create(user(session, "ana"), "m1", None, BASE).token
    with pytest.raises(InvalidInvite):
        await service.going(token, "   ")
    container.moves.end("m1")
    with pytest.raises(InviteMoveGone):
        await service.going(token, "Sam")
    page = service.page(token, count_open=True)
    assert page.live is False and page.mark_name == ""


async def test_page_names_only_creator_and_sharer(
    session: Session, container: Container
) -> None:
    container.moves.moves["m1"] = kumo_move(participants=("ana", "bo", "dee"))
    service = InviteService(session, container)
    first = service.create(user(session, "bo"), "m1", None, BASE).token
    await service.going(first, "Sam")
    other = service.create(user(session, "ana"), "m1", None, BASE).token
    page = service.page(other, count_open=False)
    assert page.hosts == ("Ana",)
    assert page.others_count == 3  # Bo, Dee and the guest Sam: counted only
    assert "Dee" not in repr(page) and "Sam" not in repr(page)
