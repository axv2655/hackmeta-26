"""Moments (core C8): upload, tags, approval, and who may see them
(ARCHITECTURE.md 1.5 rule 7, 5.3, 7.4, 9).

Rules:

* Only a participant of a live Move may add a Moment, and may tag only other
  participants (the people who were there and so are in the photo).
* A Moment's `status` is `approved` exactly when every tag is approved; with
  no tags it is approved at once. A decline keeps it `pending`, and so does a
  later change of mind: consent can be withdrawn.
* Who sees a Moment derives from `domain.privacy.can_see` on its Move: the
  viewer must see the Move, and a `pending` Moment is further limited to the
  Move's participants. A blocked user never sees one, participant or not.

Side effects run after the commit, and a failing one is logged and skipped:

* `moment.added` (moment_id, move_id, status) to everyone who can now see
  the Moment; on approval, to those who could not see it before.
* `moment.approval_needed` (moment_id, move_id) and a `moment_approval`
  notification through the `Notifier` port, to each tagged user.

Media is written to `media_dir` as `<moment id><ext>`, after the type is
checked against both the declared content type and the file's leading bytes.
It is served only through `media()`, which applies the same visibility.
"""

import logging
from collections.abc import Collection, Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO

from sqlmodel import Session, col, select

from app.domain.errors import Forbidden, Invalid, MoveNotFound, MoveNotLive, NotFound
from app.domain.privacy import MoveVisibility, can_see
from app.ports import (
    Clock,
    EventPublisher,
    EventType,
    MediaType,
    MomentStatus,
    Notifier,
)
from app.repositories.audience import SqlAudienceRepository
from app.tables import Moment, MomentTag, Move, User
from app.tables.types import new_id

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_CAPTION = 280
_CHUNK = 64 * 1024


@dataclass(frozen=True, slots=True)
class MediaKind:
    media_type: MediaType
    extension: str
    content_type: str


MEDIA_KINDS: dict[str, MediaKind] = {
    kind.content_type: kind
    for kind in (
        MediaKind("photo", ".jpg", "image/jpeg"),
        MediaKind("photo", ".png", "image/png"),
        MediaKind("photo", ".webp", "image/webp"),
        MediaKind("photo", ".heic", "image/heic"),
        MediaKind("clip", ".mp4", "video/mp4"),
        MediaKind("clip", ".mov", "video/quicktime"),
    )
}
_BY_EXTENSION = {kind.extension: kind for kind in MEDIA_KINDS.values()}


def _sniff(head: bytes) -> str | None:
    """The content type the file's leading bytes prove, if any we accept."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in {b"heic", b"heix", b"mif1", b"msf1"}:
            return "image/heic"
        return "video/quicktime" if brand == b"qt  " else "video/mp4"
    return None


# --- Errors ------------------------------------------------------------------


class MomentNotFound(NotFound):
    """No such Moment, or the viewer may not see it (indistinguishable)."""

    def __init__(self, moment_id: str) -> None:
        super().__init__(f"moment {moment_id} not found")


class NotMoveParticipant(Forbidden):
    def __init__(self, move_id: str) -> None:
        super().__init__(f"only participants can add moments to move {move_id}")


class NotTagged(Forbidden):
    def __init__(self, moment_id: str) -> None:
        super().__init__(f"you are not tagged in moment {moment_id}")


class InvalidMoment(Invalid):
    """Bad upload: type, size, caption or tags."""


# --- Rules -------------------------------------------------------------------


def moment_status(answers: Iterable[bool | None]) -> MomentStatus:
    """`approved` iff every tagged user approved (vacuously so with no tags)."""
    return "approved" if all(a is True for a in answers) else "pending"


def may_view(viewer_id: str, move: MoveVisibility, status: str) -> bool:
    """A Moment is visible to whoever can see its Move once approved, and to
    the Move's participants (and creator) before that."""
    if not can_see(viewer_id, move):
        return False
    return status == "approved" or viewer_id in _insiders(move)


def _insiders(move: MoveVisibility) -> frozenset[str]:
    return move.participant_ids | {move.creator_id}


def _viewers(move: MoveVisibility, status: str) -> frozenset[str]:
    """Everyone `may_view` admits for a Moment with this status."""
    pool = _insiders(move) | (move.audience_ids if status == "approved" else set())
    return frozenset(u for u in pool if may_view(u, move, status))


# --- Service -----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MomentView:
    moment: Moment
    author: User
    tags: tuple[tuple[User, bool | None], ...]


@dataclass(frozen=True, slots=True)
class MediaFile:
    path: Path
    content_type: str


@dataclass(frozen=True, slots=True)
class _Event:
    user_ids: frozenset[str]
    type: EventType
    data: dict[str, Any]


class MomentService:
    def __init__(
        self,
        session: Session,
        clock: Clock,
        events: EventPublisher,
        notifier: Notifier,
        media_dir: Path,
        *,
        media_url_prefix: str = "/media",
        max_bytes: int = MAX_UPLOAD_BYTES,
    ) -> None:
        self.session = session
        self.clock = clock
        self.events = events
        self.notifier = notifier
        self.media_dir = media_dir
        self.media_url_prefix = media_url_prefix.rstrip("/")
        self.max_bytes = max_bytes
        self.audience = SqlAudienceRepository(session)

    # --- Reads ---------------------------------------------------------------

    def list_for_move(self, viewer_id: str, move_id: str) -> list[MomentView]:
        """The Move's Moments the viewer may see, oldest first. Raises
        `MoveNotFound` if the viewer cannot see the Move."""
        move = self._visible_move(viewer_id, move_id)
        moments = self.session.exec(
            select(Moment)
            .where(Moment.move_id == move_id)
            .order_by(col(Moment.created_at), col(Moment.id))
        ).all()
        return [self._view(m) for m in moments if may_view(viewer_id, move, m.status)]

    def get(self, viewer_id: str, moment_id: str) -> MomentView:
        moment, _ = self._visible_moment(viewer_id, moment_id)
        return self._view(moment)

    def media(self, viewer_id: str, filename: str) -> MediaFile:
        """The stored file behind `filename` if the viewer may see its Moment.
        Anything else, including a malformed name, is `MomentNotFound`."""
        name = Path(filename)
        kind = _BY_EXTENSION.get(name.suffix)
        if kind is None or name.name != filename:
            raise MomentNotFound(name.stem)
        moment, _ = self._visible_moment(viewer_id, name.stem)
        path = self.media_dir / filename
        if moment.media_url != self._url(filename) or not path.is_file():
            raise MomentNotFound(moment.id)
        return MediaFile(path, kind.content_type)

    # --- Mutations -----------------------------------------------------------

    async def upload(
        self,
        author_id: str,
        move_id: str,
        file: BinaryIO,
        content_type: str | None,
        caption: str = "",
        tagged_ids: Sequence[str] = (),
    ) -> MomentView:
        """Store the media and the Moment with its tags, then announce it.
        Raises `MoveNotFound`, `MoveNotLive`, `NotMoveParticipant`,
        `InvalidMoment`."""
        move = self._visible_move(author_id, move_id)
        row = self.session.get(Move, move_id)
        assert row is not None
        if row.status != "live":
            raise MoveNotLive(move_id, row.status)
        if author_id not in _insiders(move):
            raise NotMoveParticipant(move_id)
        caption = caption.strip()
        if len(caption) > MAX_CAPTION:
            raise InvalidMoment(f"caption is longer than {MAX_CAPTION} characters")
        tags = self._check_tags(author_id, move, tagged_ids)
        kind, data = self._read_media(file, content_type)

        moment_id = new_id()
        filename = moment_id + kind.extension
        moment = Moment(
            id=moment_id,
            move_id=move_id,
            mark_id=row.mark_id,
            author_id=author_id,
            media_url=self._url(filename),
            media_type=kind.media_type,
            caption=caption,
            status=moment_status(None for _ in tags),
            created_at=self.clock.now(),
        )
        self.session.add(moment)
        self.session.add_all(MomentTag(moment_id=moment_id, user_id=u) for u in tags)
        path = self.media_dir / filename
        self.media_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        try:
            self.session.commit()
        except Exception:
            path.unlink(missing_ok=True)
            raise

        ref = {"moment_id": moment_id, "move_id": move_id}
        await self._publish(
            [
                _Event(
                    _viewers(move, moment.status),
                    "moment.added",
                    {**ref, "status": moment.status},
                ),
                _Event(frozenset(tags), "moment.approval_needed", ref),
            ]
        )
        author = self.session.get(User, author_id)
        assert author is not None
        for user_id in tags:
            await self._notify(user_id, author.first_name, ref)
        return self._view(moment)

    async def answer(self, user_id: str, moment_id: str, approve: bool) -> MomentView:
        """A tagged user approves or declines (or changes their answer).
        Raises `MomentNotFound`, `NotTagged`."""
        moment, move = self._visible_moment(user_id, moment_id)
        tag = self.session.get(MomentTag, (moment_id, user_id))
        if tag is None:
            raise NotTagged(moment_id)
        tag.approved = approve
        self.session.add(tag)
        before = moment.status
        moment.status = moment_status(t.approved for t in self._tags(moment_id))
        self.session.add(moment)
        self.session.commit()
        if before != "approved" and moment.status == "approved":
            newly = _viewers(move, "approved") - _viewers(move, before)
            data = {"moment_id": moment.id, "move_id": moment.move_id}
            await self._publish(
                [_Event(newly, "moment.added", {**data, "status": "approved"})]
            )
        return self._view(moment)

    # --- Helpers -------------------------------------------------------------

    def _visible_move(self, viewer_id: str, move_id: str) -> MoveVisibility:
        move = self.audience.move_visibility(move_id)
        if move is None or not can_see(viewer_id, move):
            raise MoveNotFound(move_id)
        return move

    def _visible_moment(
        self, viewer_id: str, moment_id: str
    ) -> tuple[Moment, MoveVisibility]:
        moment = self.session.get(Moment, moment_id)
        if moment is not None:
            move = self.audience.move_visibility(moment.move_id)
            if move is not None and may_view(viewer_id, move, moment.status):
                return moment, move
        raise MomentNotFound(moment_id)

    def _check_tags(
        self, author_id: str, move: MoveVisibility, tagged_ids: Collection[str]
    ) -> tuple[str, ...]:
        tags = tuple(dict.fromkeys(u for u in tagged_ids if u != author_id))
        if any(u not in _insiders(move) for u in tags):
            raise InvalidMoment("only people in the move can be tagged")
        return tags

    def _read_media(
        self, file: BinaryIO, content_type: str | None
    ) -> tuple[MediaKind, bytes]:
        kind = MEDIA_KINDS.get((content_type or "").split(";")[0].strip().lower())
        if kind is None:
            raise InvalidMoment(f"unsupported media type {content_type!r}")
        data = bytearray()
        while chunk := file.read(_CHUNK):
            data += chunk
            if len(data) > self.max_bytes:
                raise InvalidMoment(f"file is larger than {self.max_bytes} bytes")
        if not data:
            raise InvalidMoment("file is empty")
        sniffed = _sniff(bytes(data[:16]))
        if sniffed is None or MEDIA_KINDS[sniffed].media_type != kind.media_type:
            raise InvalidMoment("file content does not match its type")
        return MEDIA_KINDS[sniffed], bytes(data)

    def _tags(self, moment_id: str) -> Sequence[MomentTag]:
        return self.session.exec(
            select(MomentTag)
            .where(MomentTag.moment_id == moment_id)
            .order_by(col(MomentTag.user_id))
        ).all()

    def _view(self, moment: Moment) -> MomentView:
        tags = self._tags(moment.id)
        users = {u.id: u for u in self.audience.users([t.user_id for t in tags])}
        author = self.session.get(User, moment.author_id)
        assert author is not None
        return MomentView(
            moment, author, tuple((users[t.user_id], t.approved) for t in tags)
        )

    def _url(self, filename: str) -> str:
        return f"{self.media_url_prefix}/{filename}"

    async def _publish(self, events: Iterable[_Event]) -> None:
        for event in events:
            if not event.user_ids:
                continue
            try:
                await self.events.publish(event.user_ids, event.type, event.data)
            except Exception:
                logger.exception("publishing %s failed", event.type)

    async def _notify(
        self, user_id: str, author_name: str, data: dict[str, str]
    ) -> None:
        try:
            await self.notifier.send(
                user_id,
                "moment_approval",
                f"{author_name} tagged you in a moment",
                "OK to share?",
                data,
            )
        except Exception:
            logger.exception("moment_approval notification to %s failed", user_id)
