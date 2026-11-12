"""Calendar flare and free-time agent (ARCHITECTURE.md 10.6, 11.2).

A scheduler job runs `run_flare_scan` every 60 s for users with
`muse_proactive` on; Demo Control calls it (and `run_free_time_scan`) on
demand. Muse never posts: a hit only stores a suggestion; the user's tap on
accept creates the Move.

Gates, in order (cheap first, Muse last):
1. `muse_proactive` on, not in quiet hours.
2. At most 2 proactive suggestions (flare / free_time) per user per day.
3. A free window of at least 20 minutes from `CalendarGateway`.
4. Options: saved Marks not proposed in the last 3 days (derived from our
   own `suggestions` rows, never `saved_marks.flared_at`) and not dismissed
   in the last week; friends and pseudo-group members who are free too.
5. Muse decides `flare | free_time | act=false`. A "no" for the same options
   and window is remembered for 15 minutes, so the 60 s job does not spend
   tokens re-asking.

Fill window: under 60 free minutes means 5 to 10 minutes; otherwise 10 to 30.
Travel time is not modeled (no user location on the server).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field
from sqlmodel import Session, col, or_, select

from app.domain.affinity import clock_label
from app.muse.agents import move_writer
from app.muse.agents.move_writer import WriterInput
from app.muse.compose import ComposeService
from app.muse.context import AliasBook, Candidate, load_candidates
from app.muse.lane import MuseLane
from app.ports import FreeWindow, MarkSnapshot, MoveDraftOut, SuggestionSnapshot
from app.services.notify import in_quiet_hours
from app.services.suggestions import SuggestionService, draft_to_dict
from app.tables import Friendship, Hangout, PseudoGroup, SavedMark, UserSettings

AGENT = "flare"
MAX_TOKENS = 350
MIN_WINDOW = 20
DAILY_CAP = 2
PROPOSED_COOLDOWN = timedelta(days=3)
DISMISS_SUPPRESS = timedelta(days=7)
NO_MEMO_S = 15 * 60
MAX_SAVED = 10
MAX_PEOPLE = 8
PROACTIVE = ("flare", "free_time")


class FlareOut(BaseModel):
    act: bool
    type: Literal["flare", "free_time"] = "flare"
    mark: str | None = None
    invite: list[str] = Field(default_factory=list)
    fill_minutes: int | None = None
    text: str = ""
    message: str = ""
    chips: list[str] = Field(default_factory=list)


def fill_minutes(window_minutes: int, asked: int | None) -> int:
    if window_minutes < 60:
        return min(10, max(5, asked or 10))
    return min(30, max(10, asked or 15))


@dataclass
class Options:
    window: FreeWindow
    saved: list[tuple[MarkSnapshot, datetime]]
    free: list[Candidate]
    crew: set[str]


@dataclass
class FlareScanner:
    lane: MuseLane
    _no_memo: dict[tuple, float] = field(default_factory=dict)

    async def run_flare_scan(self, user_id: str) -> SuggestionSnapshot | None:
        return await self._scan(user_id, allow_flare=True)

    async def run_free_time_scan(self, user_id: str) -> SuggestionSnapshot | None:
        return await self._scan(user_id, allow_flare=False)

    async def scan_all(self) -> int:
        """The 60 s job: every user with `muse_proactive` on."""
        with self.lane.session() as session:
            users = session.exec(
                select(UserSettings.user_id).where(UserSettings.muse_proactive)
            ).all()
        hits = 0
        for uid in users:
            hits += await self.run_flare_scan(uid) is not None
        return hits

    async def _scan(
        self, user_id: str, *, allow_flare: bool
    ) -> SuggestionSnapshot | None:
        with self.lane.session() as session:
            opts = self.options(session, user_id, allow_flare=allow_flare)
            if opts is None:
                return None
            key = (
                user_id,
                allow_flare,
                tuple(m.id for m, _ in opts.saved),
                tuple(c.user_id for c in opts.free),
                opts.window.start,
                opts.window.end,
            )
            if self._no_memo.get(key, 0) > time.monotonic():
                return None
            result = await self._ask(session, user_id, opts)
            if result is None:
                self._no_memo[key] = time.monotonic() + NO_MEMO_S
            return result

    def options(
        self, session: Session, user_id: str, *, allow_flare: bool = True
    ) -> Options | None:
        now = self.lane.now()
        settings = session.get(UserSettings, user_id)
        if settings is None or not settings.muse_proactive:
            return None
        if in_quiet_hours(settings, now):
            return None
        svc = SuggestionService(session, self.lane)
        if len(svc.recent(user_id, PROACTIVE, now - timedelta(days=1))) >= DAILY_CAP:
            return None
        window = self.lane.container.calendar.free_window(user_id, now)
        if window is None or window.minutes < MIN_WINDOW:
            return None

        saved: list[tuple[MarkSnapshot, datetime]] = []
        if allow_flare:
            blocked = self._blocked_marks(svc, user_id, now)
            compose = ComposeService(session, self.lane)
            rows = session.exec(
                select(SavedMark)
                .where(SavedMark.user_id == user_id)
                .order_by(col(SavedMark.saved_at).desc())
            ).all()
            for row in rows:
                mark = compose.mark(row.mark_id)
                if mark is not None and row.mark_id not in blocked:
                    saved.append((mark, row.saved_at))
            saved = saved[:MAX_SAVED]

        crew = self._crew(session, user_id)
        people = self._friends(session, user_id) | crew
        cands = load_candidates(
            session, user_id, people, now, calendar=self.lane.container.calendar
        )
        free = [c for c in cands if c.features.currently == "free"][:MAX_PEOPLE]
        if not saved and not free:
            return None
        return Options(window, saved, free, crew)

    def _blocked_marks(
        self, svc: SuggestionService, user_id: str, now: datetime
    ) -> set[str]:
        blocked: set[str] = set()
        for s in svc.recent(user_id, PROACTIVE, now - DISMISS_SUPPRESS):
            mid = (s.payload or {}).get("mark_id")
            if not mid:
                continue
            if s.created_at >= now - PROPOSED_COOLDOWN or s.status == "dismissed":
                blocked.add(mid)
        return blocked

    def _friends(self, session: Session, user_id: str) -> set[str]:
        rows = session.exec(
            select(Friendship).where(
                or_(Friendship.user_a == user_id, Friendship.user_b == user_id)
            )
        ).all()
        return {r.user_b if r.user_a == user_id else r.user_a for r in rows}

    def _crew(self, session: Session, user_id: str) -> set[str]:
        rows = session.exec(select(PseudoGroup).where(PseudoGroup.owner_id == user_id))
        return {m for g in rows for m in g.member_ids if m != user_id}

    async def _ask(
        self, session: Session, user_id: str, opts: Options
    ) -> SuggestionSnapshot | None:
        now = self.lane.now()
        w = opts.window
        window_label = f"free {clock_label(w.start)}–{clock_label(w.end)}"
        marks, people = AliasBook("k"), AliasBook("u")
        mark_rows = [
            f"{marks.alias(m.id, m.name)} | {m.name} | {m.category} | "
            f"{', '.join(m.vibe_tags) or '-'} | saved {(now - at).days}d ago"
            for m, at in opts.saved
        ]
        people_rows = [
            f"{people.alias(c.user_id, c.first_name)} | aff {c.affinity:.1f} | "
            f"crew {'y' if c.user_id in opts.crew else 'n'}"
            for c in opts.free
        ]
        prompt = "\n".join(
            [
                f"Window: {window_label} ({w.minutes} min). Now {clock_label(now)}.",
                "Saved places:",
                *(mark_rows or ["(none)"]),
                "Free friends:",
                *(people_rows or ["(none)"]),
            ]
        )
        saved_at = {m.id: at for m, at in opts.saved}
        free_ids = {c.user_id for c in opts.free}

        def check(out: FlareOut) -> FlareOut:
            if not out.act:
                return out
            invite = [u for u in (people.id_of(a) for a in out.invite) if u in free_ids]
            if out.type == "flare" and marks.id_of(out.mark) not in saved_at:
                raise ValueError("flare needs one of the saved places")
            if out.type == "free_time" and not invite:
                raise ValueError("free_time needs a free friend")
            if not out.message.strip():
                raise ValueError("empty message")
            return out

        def fallback() -> FlareOut:
            return self._fallback(opts, marks, people, window_label, now)

        out = await self.lane.runner.run_agent(
            AGENT,
            user_id,
            prompt,
            FlareOut,
            fallback,
            max_tokens=MAX_TOKENS,
            slow=True,
            check=check,
        )
        if not out.act:
            return None
        return await self._store(session, user_id, out, opts, marks, people, now)

    def _fallback(
        self,
        opts: Options,
        marks: AliasBook,
        people: AliasBook,
        window_label: str,
        now: datetime,
    ) -> FlareOut:
        invite = [people.alias(c.user_id) for c in opts.free[:3]]
        until = clock_label(opts.window.end)
        if opts.saved:
            mark, at = opts.saved[0]
            k = marks.alias(mark.id)
            who = " + ".join("{" + a + "}" for a in invite[:2])
            message = f"You saved {{{k}}}. You're free til {until}."
            message += f" Send a flare to {who}?" if who else " Send a flare?"
            chips = [window_label, f"saved {(now - at).days}d ago"]
            return FlareOut(
                act=True,
                type="flare",
                mark=k,
                invite=invite,
                message=message,
                chips=chips,
            )
        if opts.free:
            a = invite[0]
            message = (
                f"You've got {opts.window.minutes} min and {{{a}}}'s free too. "
                "Want to start a Move?"
            )
            return FlareOut(
                act=True,
                type="free_time",
                invite=invite[:2],
                message=message,
                chips=[window_label, f"{{{a}}} free too"],
            )
        return FlareOut(act=False)

    async def _store(
        self,
        session: Session,
        user_id: str,
        out: FlareOut,
        opts: Options,
        marks: AliasBook,
        people: AliasBook,
        now: datetime,
    ) -> SuggestionSnapshot:
        free_ids = {c.user_id for c in opts.free}
        invite = [u for u in (people.id_of(a) for a in out.invite) if u in free_ids]
        mark: MarkSnapshot | None = None
        if out.type == "flare":
            mark_id = marks.id_of(out.mark)
            mark = next(m for m, _ in opts.saved if m.id == mark_id)
        else:
            mark = self._usual_spot(session, user_id, invite)
        fill = fill_minutes(opts.window.minutes, out.fill_minutes)
        text = move_writer.normalize(out.text)
        if not text or len(text) >= move_writer.MAX_LEN:
            text = move_writer.fallback(WriterInput(user_id, mark, now)).text
        draft = MoveDraftOut(
            mark_id=mark.id if mark else None,
            text=text,
            category=mark.category if mark else "other",
            kind="flare" if out.type == "flare" else "move",
            user_ids=tuple(invite),
            fill_minutes=fill if out.type == "flare" else None,
            chips=tuple(people.restore(c, marks) for c in out.chips[:3]),
        )
        payload = {
            "message": people.restore(out.message, marks),
            "chips": list(draft.chips),
            "draft": draft_to_dict(draft),
            "mark_id": mark.id if mark else None,
            "invite": invite,
            "fill_minutes": draft.fill_minutes,
            "window_end": opts.window.end.isoformat(),
        }
        return await SuggestionService(session, self.lane).create_suggestion(
            user_id, out.type, payload, expires_at=opts.window.end
        )

    def _usual_spot(
        self, session: Session, user_id: str, invite: list[str]
    ) -> MarkSnapshot | None:
        """Where the user most often hung out with these friends."""
        rows = session.exec(
            select(Hangout).where(
                or_(
                    (col(Hangout.user_a) == user_id) & col(Hangout.user_b).in_(invite),
                    (col(Hangout.user_b) == user_id) & col(Hangout.user_a).in_(invite),
                )
            )
        ).all()
        if not rows:
            return None
        counts: dict[str, int] = {}
        for h in rows:
            counts[h.mark_id] = counts.get(h.mark_id, 0) + 1
        best = max(sorted(counts), key=lambda k: counts[k])
        return ComposeService(session, self.lane).mark(best)
