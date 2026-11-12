"""Suggestions: anything Muse proposes to a user (ARCHITECTURE.md 10.6 to 10.10).

Every muse agent that proposes something stores it with
`create_suggestion(user_id, type, payload, expires_at)`, which stores the row,
sends the matching `muse_<type>` notification through the `Notifier`
(`data.route=/suggestion/{id}`) and publishes `suggestion.created`.

Muse never posts on its own. Only the user's tap on accept acts:

- `flare` / `free_time`: create the Move via `MoveGateway.create` (flare:
  `kind=flare` with `fill_minutes`; Muse's invite list becomes
  `notify_user_ids`). Without a Mark the draft is returned for the composer.
- `nobody_bit`: join the other Move, then end the user's empty one.
- `revive` / `route` / `reel_move`: return the stored draft.

Payload keys: `message`, `chips`, `draft` (a `MoveDraftOut` as a dict), and
per type `mark_id`, `invite`, `fill_minutes`, `target_move_id`,
`own_move_id`, `group_id`, `move_id`, `pair`.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime
from typing import Any

from sqlmodel import Session, col, select

from app.muse.lane import MuseLane
from app.ports import (
    MoveCreate,
    MoveDraftOut,
    NotificationType,
    NotifyPickOut,
    SuggestionSnapshot,
    SuggestionType,
)
from app.tables import Suggestion

NOTIFY_TYPE: dict[str, NotificationType] = {
    "flare": "muse_flare",
    "free_time": "muse_free_time",
    "revive": "muse_revive",
    "nobody_bit": "muse_nobody_bit",
    "route": "muse_route",
}
TITLES = {
    "flare": "Send a flare?",
    "free_time": "You've got a window",
    "revive": "Get the crew back together?",
    "nobody_bit": "Somewhere to go",
    "route": "Go together?",
    "reel_move": "Start a Move here?",
}


class SuggestionNotFound(LookupError):
    pass


class SuggestionClosed(RuntimeError):
    """Already accepted, dismissed or expired."""


def draft_to_dict(draft: MoveDraftOut) -> dict[str, Any]:
    out = asdict(draft)
    out["notify"] = [asdict(p) for p in draft.notify]
    return out


def draft_from_dict(data: dict[str, Any] | None) -> MoveDraftOut | None:
    if not data:
        return None
    fields = dict(data)
    fields["notify"] = tuple(NotifyPickOut(**p) for p in fields.get("notify", ()))
    for key in ("alternates", "circle_ids", "user_ids", "chips", "nearby_mark_ids"):
        fields[key] = tuple(fields.get(key, ()))
    return MoveDraftOut(**fields)


def snapshot(row: Suggestion) -> SuggestionSnapshot:
    p = row.payload or {}
    return SuggestionSnapshot(
        id=row.id,
        user_id=row.user_id,
        type=row.type,
        status=row.status,
        message=p.get("message", ""),
        created_at=row.created_at,
        expires_at=row.expires_at,
        chips=tuple(p.get("chips", ())),
        draft=draft_from_dict(p.get("draft")),
    )


def suggestion_dict(row: Suggestion) -> dict[str, Any]:
    p = row.payload or {}
    return {
        "id": row.id,
        "type": row.type,
        "message": p.get("message", ""),
        "chips": list(p.get("chips", ())),
        "draft": p.get("draft"),
        "status": row.status,
        "created_at": row.created_at.isoformat(),
        "expires_at": row.expires_at.isoformat(),
    }


@dataclass(frozen=True)
class AcceptEdits:
    """Optional edits the user made on the suggestion card before tapping yes."""

    text: str | None = None
    user_ids: tuple[str, ...] | None = None
    fill_minutes: int | None = None


@dataclass(frozen=True)
class AcceptResult:
    suggestion: SuggestionSnapshot
    move_id: str | None = None
    draft: MoveDraftOut | None = None


class SuggestionService:
    def __init__(self, session: Session, lane: MuseLane) -> None:
        self.session = session
        self.lane = lane
        self.c = lane.container

    async def create_suggestion(
        self,
        user_id: str,
        type: SuggestionType,
        payload: dict[str, Any],
        expires_at: datetime,
    ) -> SuggestionSnapshot:
        row = Suggestion(
            user_id=user_id,
            type=type,
            payload=payload,
            created_at=self.lane.now(),
            expires_at=expires_at,
        )
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        if type in NOTIFY_TYPE:
            await self.c.notifier.send(
                user_id,
                NOTIFY_TYPE[type],
                TITLES[type],
                payload.get("message", ""),
                {"route": f"/suggestion/{row.id}", "suggestion_id": row.id},
            )
        await self.c.events.publish(
            [user_id], "suggestion.created", suggestion_dict(row)
        )
        return snapshot(row)

    def pending(self, user_id: str) -> list[Suggestion]:
        rows = self.session.exec(
            select(Suggestion)
            .where(
                Suggestion.user_id == user_id,
                Suggestion.status == "pending",
                Suggestion.expires_at > self.lane.now(),
            )
            .order_by(col(Suggestion.created_at).desc())
        ).all()
        return list(rows)

    def get(self, user_id: str, suggestion_id: str) -> Suggestion:
        row = self.session.get(Suggestion, suggestion_id)
        if row is None or row.user_id != user_id:
            raise SuggestionNotFound(suggestion_id)
        return row

    def _open(self, user_id: str, suggestion_id: str) -> Suggestion:
        row = self.get(user_id, suggestion_id)
        if row.status != "pending" or row.expires_at <= self.lane.now():
            raise SuggestionClosed(f"suggestion is {row.status}")
        return row

    async def accept(
        self, user_id: str, suggestion_id: str, edits: AcceptEdits | None = None
    ) -> AcceptResult:
        row = self._open(user_id, suggestion_id)
        p = row.payload or {}
        draft = draft_from_dict(p.get("draft"))
        if draft is not None and edits is not None:
            draft = replace(
                draft,
                text=edits.text or draft.text,
                user_ids=edits.user_ids
                if edits.user_ids is not None
                else draft.user_ids,
                fill_minutes=edits.fill_minutes or draft.fill_minutes,
            )
        move_id: str | None = None

        if row.type in ("flare", "free_time") and draft and draft.mark_id:
            invite = tuple(dict.fromkeys(draft.user_ids))
            move = await self.c.moves.create(
                user_id,
                MoveCreate(
                    mark_id=draft.mark_id,
                    text=draft.text,
                    category=draft.category,
                    circle_ids=draft.circle_ids,
                    user_ids=invite,
                    kind="flare" if row.type == "flare" else "move",
                    fill_minutes=draft.fill_minutes if row.type == "flare" else None,
                    origin="saved_flare" if row.type == "flare" else "free_time",
                    origin_ref=row.id,
                    notify_user_ids=invite,
                ),
            )
            move_id = move.id
        elif row.type == "nobody_bit":
            target, own = p.get("target_move_id"), p.get("own_move_id")
            if target:
                await self.c.moves.add_participant(target, user_id, "going", "tap")
                move_id = target
            if own:
                await self.c.moves.end(own, "nobody_bit")

        row.status = "accepted"
        if draft is not None:
            row.payload = {**p, "draft": draft_to_dict(draft)}
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return AcceptResult(snapshot(row), move_id, draft)

    def dismiss(self, user_id: str, suggestion_id: str) -> SuggestionSnapshot:
        row = self._open(user_id, suggestion_id)
        row.status = "dismissed"
        row.payload = {
            **(row.payload or {}),
            "dismissed_at": self.lane.now().isoformat(),
        }
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return snapshot(row)

    def expire(self) -> int:
        rows = self.session.exec(
            select(Suggestion).where(
                Suggestion.status == "pending", Suggestion.expires_at <= self.lane.now()
            )
        ).all()
        for row in rows:
            row.status = "expired"
            self.session.add(row)
        self.session.commit()
        return len(rows)

    def recent(
        self,
        user_id: str,
        types: tuple[str, ...],
        since: datetime,
        statuses: tuple[str, ...] | None = None,
    ) -> list[Suggestion]:
        query = select(Suggestion).where(
            Suggestion.user_id == user_id,
            col(Suggestion.type).in_(types),
            Suggestion.created_at >= since,
        )
        if statuses is not None:
            query = query.where(col(Suggestion.status).in_(statuses))
        return list(self.session.exec(query).all())
