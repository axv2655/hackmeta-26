"""Audience use cases (core C2): resolve, preview, store, check visibility.

`MoveService` (C4) calls `resolve` then `save` on `POST /moves`; the composer
calls `preview` through `POST /audience/preview`. Both go through `resolve`,
so the preview lists exactly the people the Move will be stored with.

Build one per session: `AudienceService(SqlAudienceRepository(session))`.
"""

from collections.abc import Iterable
from dataclasses import dataclass

from app.domain.privacy import ResolvedAudience, can_see, resolve_audience
from app.repositories.audience import AudienceRepository, CircleMembers
from app.tables import User


@dataclass(frozen=True, slots=True)
class CircleLabel:
    id: str
    name: str


@dataclass(frozen=True, slots=True)
class AudiencePreview:
    """The AudienceLine: "Visible to 9 people: Roommates, Priya, Tony".

    `people` is everyone in the audience, ordered by name; blocked users and
    the creator are never in it.
    """

    count: int
    circles: tuple[CircleLabel, ...]
    people: tuple[User, ...]


class AudienceService:
    def __init__(self, repository: AudienceRepository) -> None:
        self.repository = repository

    def resolve(
        self, creator_id: str, circle_ids: Iterable[str], user_ids: Iterable[str]
    ) -> ResolvedAudience:
        """Who a Move from `creator_id` would go to.

        Only Circles the creator owns count, and direct picks that are not
        real users are dropped; blocked users and the creator are removed.
        """
        return self._resolve(creator_id, circle_ids, user_ids)[1]

    def preview(
        self, creator_id: str, circle_ids: Iterable[str], user_ids: Iterable[str]
    ) -> AudiencePreview:
        circles, resolved = self._resolve(creator_id, circle_ids, user_ids)
        return AudiencePreview(
            count=len(resolved),
            circles=tuple(CircleLabel(id=c.id, name=c.name) for c in circles),
            people=tuple(self.repository.users(resolved.user_ids)),
        )

    def save(self, move_id: str, audience: ResolvedAudience) -> None:
        """Store `audience` for `move_id`. The caller commits."""
        self.repository.save(move_id, audience)

    def can_see(self, viewer_id: str, move_id: str) -> bool:
        """`domain.privacy.can_see` for a stored Move; False if it does not exist."""
        move = self.repository.move_visibility(move_id)
        return move is not None and can_see(viewer_id, move)

    def _resolve(
        self, creator_id: str, circle_ids: Iterable[str], user_ids: Iterable[str]
    ) -> tuple[list[CircleMembers], ResolvedAudience]:
        circles = self.repository.owned_circles(creator_id, circle_ids)
        picks = list(dict.fromkeys(user_ids))
        existing = self.repository.existing_user_ids(picks)
        resolved = resolve_audience(
            creator_id,
            circles={c.id: c.member_ids for c in circles},
            user_ids=[uid for uid in picks if uid in existing],
            hidden_from=self.repository.hidden_from(creator_id),
        )
        return circles, resolved
