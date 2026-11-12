"""Who may see a Move, and who a new Move goes to (ARCHITECTURE.md 1.5, 7.2, 12.1).

Pure rules, standard library only. `can_see` is the one visibility check in
the backend; `resolve_audience` is the one place an audience is computed, used
both by `POST /audience/preview` and by `POST /moves`, so the preview always
matches what gets stored.

A block is directional: `blocks(user_id=A, hidden_from_user_id=B)` means A's
Moves are never shown to B. Here that is A's `hidden_from` set.
"""

from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass

DIRECT = "direct"


def circle_via(circle_id: str) -> str:
    """The `move_audience.via` value for someone reached through a Circle."""
    return f"circle:{circle_id}"


@dataclass(frozen=True, slots=True)
class MoveVisibility:
    """The facts `can_see` needs about one Move."""

    creator_id: str
    audience_ids: frozenset[str]
    participant_ids: frozenset[str]
    hidden_from_ids: frozenset[str]
    """Users the creator has blocked (their "never show my Moves to" list)."""


def can_see(viewer_id: str, move: MoveVisibility) -> bool:
    """True iff the viewer is the creator, or is a participant or in the
    audience and is not blocked by the creator."""
    if viewer_id == move.creator_id:
        return True
    if viewer_id in move.hidden_from_ids:
        return False
    return viewer_id in move.participant_ids or viewer_id in move.audience_ids


@dataclass(frozen=True, slots=True)
class ResolvedAudience:
    """Who a Move goes to, ready to write to `move_audience`.

    `via` maps each user id to `"direct"` or `"circle:<id>"`; a direct pick
    wins over a Circle, otherwise the first selected Circle wins.
    `circle_ids` are the selected Circles, in selection order, for
    `move_audience_circles` and the "Visible to: Roommates, ..." label.
    """

    via: Mapping[str, str]
    circle_ids: tuple[str, ...]

    @property
    def user_ids(self) -> frozenset[str]:
        return frozenset(self.via)

    def __len__(self) -> int:
        return len(self.via)


def resolve_audience(
    creator_id: str,
    circles: Mapping[str, Iterable[str]],
    user_ids: Iterable[str],
    hidden_from: Collection[str],
) -> ResolvedAudience:
    """Union of Circle members and direct picks, minus blocks, minus self.

    `circles` maps each selected Circle id to its member ids, in selection
    order. Callers pass only Circles the creator owns, so a foreign Circle id
    can never widen an audience.
    """
    via: dict[str, str] = {}
    for user_id in user_ids:
        via.setdefault(user_id, DIRECT)
    for circle_id, members in circles.items():
        for user_id in members:
            via.setdefault(user_id, circle_via(circle_id))
    for user_id in (creator_id, *hidden_from):
        via.pop(user_id, None)
    return ResolvedAudience(via=via, circle_ids=tuple(circles))


def within_audience(
    user_ids: Iterable[str] | None, audience: ResolvedAudience
) -> tuple[str, ...] | None:
    """`user_ids` limited to the audience, deduplicated, order kept; None
    stays None. Used on a creator's edited notify list, so nobody outside the
    audience (blocked, never picked, the creator) is ever notified."""
    if user_ids is None:
        return None
    return tuple(u for u in dict.fromkeys(user_ids) if u in audience.via)
