"""Fakes of foreign ports for surfaces-lane tests only.

Never import another lane's fakes: a bug in theirs must not mask or break yours.
"""

from collections.abc import Collection
from datetime import UTC, datetime, timedelta

from app.ports import (
    Intent,
    MarkSnapshot,
    MoveCreate,
    MoveDraftOut,
    MoveSnapshot,
    NotifyPickOut,
)

T0 = datetime(2026, 11, 12, 15, 0, tzinfo=UTC)


class FakeClock:
    def __init__(self, now: datetime = T0) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now

    def advance(self, **delta: float) -> None:
        self._now += timedelta(**delta)


def mark(mark_id: str = "kumo", name: str = "Kumo") -> MarkSnapshot:
    return MarkSnapshot(
        id=mark_id,
        name=name,
        category="coffee",
        lat=30.28,
        lng=-97.74,
        address="1 Main St",
    )


class FakeMarks:
    """`nearest` records the coordinates it was asked about."""

    def __init__(self, *marks: MarkSnapshot) -> None:
        self.marks = {m.id: m for m in marks}
        self.nearest_calls: list[tuple[float, float, int]] = []

    def get(self, mark_id: str) -> MarkSnapshot | None:
        return self.marks.get(mark_id)

    def nearest(self, lat: float, lng: float, limit: int) -> list[MarkSnapshot]:
        self.nearest_calls.append((lat, lng, limit))
        return list(self.marks.values())[:limit]


class FakeMoves:
    def __init__(self) -> None:
        self.created: list[tuple[str, MoveCreate]] = []

    async def create(self, creator_id: str, draft: MoveCreate) -> MoveSnapshot:
        self.created.append((creator_id, draft))
        return MoveSnapshot(
            id=f"move-{len(self.created)}",
            creator_id=creator_id,
            mark=mark(draft.mark_id),
            text=draft.text,
            category=draft.category,
            status="live",
            kind=draft.kind,
            open=draft.open,
            origin=draft.origin,
            starts_at=T0,
            created_at=T0,
        )


class FakeMuse:
    """The slice of `MuseGateway` glasses uses. `down` makes every call raise;
    `intent` overrides what `parse_intent` returns."""

    def __init__(self) -> None:
        self.down = False
        self.intent: Intent | None = None
        self.compose_calls: list[dict[str, object]] = []
        self.notified: list[str] = []

    async def parse_intent(self, utterance: str) -> Intent:
        if self.down:
            raise RuntimeError("muse is down")
        return self.intent or Intent(intent="start_move", text="getting boba")

    async def compose_move(
        self,
        user_id: str,
        *,
        mark_id: str | None = None,
        seed_text: str | None = None,
        coarse: tuple[float, float] | None = None,
    ) -> MoveDraftOut:
        if self.down:
            raise RuntimeError("muse is down")
        self.compose_calls.append(
            {"mark_id": mark_id, "seed_text": seed_text, "coarse": coarse}
        )
        return MoveDraftOut(mark_id=mark_id, text=seed_text or "", category="coffee")

    async def notify_move(
        self,
        move_id: str,
        force_ids: Collection[str] = (),
        drop_ids: Collection[str] = (),
    ) -> list[NotifyPickOut]:
        self.notified.append(move_id)
        return []


class FakePlaces:
    """Canned answers for the three place fallbacks; records the calls."""

    def __init__(
        self,
        named: MarkSnapshot | None = None,
        usual: MarkSnapshot | None = None,
        demo: MarkSnapshot | None = None,
    ) -> None:
        self.named, self.usual, self.demo = named, usual, demo
        self.calls: list[str] = []

    def named_in(self, text: str) -> MarkSnapshot | None:
        self.calls.append("named")
        return self.named

    def usual_for(self, user_id: str) -> MarkSnapshot | None:
        self.calls.append("usual")
        return self.usual

    def demo_mark(self) -> MarkSnapshot | None:
        self.calls.append("demo")
        return self.demo
