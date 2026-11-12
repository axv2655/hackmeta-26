"""Errors raised by the core domain and services (Moves, Marks, participants).

Each concrete error derives from exactly one *kind*, and the kind alone decides
the HTTP status, so `app/api/errors.py` needs one handler per kind, not per
error:

| Kind            | HTTP | Meaning                                         |
| --------------- | ---- | ----------------------------------------------- |
| `NotFound`      | 404  | No such thing, or the viewer may not see it     |
| `Forbidden`     | 403  | The viewer sees it but may not do this to it    |
| `Conflict`      | 409  | The request is valid but the current state says no |
| `Invalid`       | 422  | The request itself breaks an invariant          |

Standard library only. The message (`str(exc)`) is safe to show a user; it
never names people the viewer is not allowed to see.
"""


class DomainError(Exception):
    """Base class of every core domain error."""


class NotFound(DomainError):
    """Kind: maps to 404."""


class Forbidden(DomainError):
    """Kind: maps to 403."""


class Conflict(DomainError):
    """Kind: maps to 409."""


class Invalid(DomainError):
    """Kind: maps to 422."""


class MoveNotFound(NotFound):
    """No Move with this id, or it is not visible to the viewer. The two are
    deliberately indistinguishable so a 404 never confirms a hidden Move."""

    def __init__(self, move_id: str) -> None:
        super().__init__(f"move {move_id} not found")
        self.move_id = move_id


class MarkNotFound(NotFound):
    def __init__(self, mark_id: str) -> None:
        super().__init__(f"mark {mark_id} not found")
        self.mark_id = mark_id


class NotParticipant(Conflict):
    """Arrive or leave by someone who never joined the Move."""

    def __init__(self, move_id: str, user_id: str) -> None:
        super().__init__(f"user {user_id} has not joined move {move_id}")
        self.move_id = move_id
        self.user_id = user_id


class IllegalTransition(Conflict):
    """A participant status change the state machine does not allow (7.3).
    `current` is None when the user is not a participant yet."""

    def __init__(self, current: str | None, requested: str) -> None:
        super().__init__(f"cannot go from {current or 'none'} to {requested}")
        self.current = current
        self.requested = requested


class MoveNotLive(Conflict):
    """Any change to a Move that has already ended or been cancelled."""

    def __init__(self, move_id: str, status: str) -> None:
        super().__init__(f"move {move_id} is {status}")
        self.move_id = move_id
        self.status = status


class EndNotAllowed(Conflict):
    """The end reason's condition does not hold (for example `stale` on a Move
    with recent activity)."""

    def __init__(self, move_id: str, reason: str) -> None:
        super().__init__(f"move {move_id} cannot end: {reason}")
        self.move_id = move_id
        self.reason = reason


class NotMoveCreator(Forbidden):
    """Only the creator may end a Move by hand."""

    def __init__(self, move_id: str) -> None:
        super().__init__(f"only the creator can end move {move_id}")
        self.move_id = move_id


class MoveNotOpen(Forbidden):
    """An `open_ble` join on a Move whose creator did not make it open (8.5)."""

    def __init__(self, move_id: str) -> None:
        super().__init__(f"move {move_id} is not open")
        self.move_id = move_id


class InvalidMove(Invalid):
    """A new Move breaks an invariant (blank text, bad fill window, ...)."""
