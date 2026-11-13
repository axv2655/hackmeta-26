"""Phone push: device tokens, and sending a stored notification to them.

PushTokens       the app registers its APNs token after login and drops
                 it on logout. A token moves to whoever registered it last.
ApnsPushSender   the `PushSender` port: looks up the users' tokens, sends
                 one alert each (badge = that user's unread notifications),
                 forgets tokens Apple says are dead, and never raises, so a
                 push can't break a notification.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable

from sqlalchemy import Engine
from sqlmodel import Session, col, func, select

from app.ports import Clock
from app.push.apns import ApnsClient, alert_payload
from app.tables import Notification, PushToken

log = logging.getLogger(__name__)


class PushTokens:
    def __init__(self, session: Session, clock: Clock) -> None:
        self.session = session
        self.clock = clock

    def register(self, user_id: str, token: str, sandbox: bool) -> None:
        token = token.strip().lower()
        row = self.session.get(PushToken, token)
        if row is None:
            row = PushToken(token=token, user_id=user_id, updated_at=self.clock.now())
        row.user_id, row.sandbox, row.updated_at = user_id, sandbox, self.clock.now()
        self.session.add(row)
        self.session.commit()

    def unregister(self, user_id: str, token: str) -> None:
        row = self.session.get(PushToken, token.strip().lower())
        if row is not None and row.user_id == user_id:
            self.session.delete(row)
            self.session.commit()


class ApnsPushSender:
    def __init__(self, engine: Engine, client: ApnsClient) -> None:
        self.engine = engine
        self.client = client

    async def push(
        self, user_ids: Iterable[str], title: str, body: str, data: dict[str, str]
    ) -> None:
        try:
            await self._push(list(user_ids), title, body, data)
        except Exception:  # a push must never break the notification
            log.exception("push failed")

    async def _push(
        self, user_ids: list[str], title: str, body: str, data: dict[str, str]
    ) -> None:
        with Session(self.engine) as session:
            query = select(PushToken).where(col(PushToken.user_id).in_(user_ids))
            rows = [(t.token, t.sandbox, t.user_id) for t in session.exec(query).all()]
            if not rows:
                return
            unread = _unread_counts(session, {uid for _, _, uid in rows})
        tokens = [(token, sandbox) for token, sandbox, _ in rows]
        results = await asyncio.gather(
            *(
                self.client.send(
                    token, alert_payload(title, body, data, unread.get(uid, 0)), sandbox
                )
                for token, sandbox, uid in rows
            ),
            return_exceptions=True,
        )
        dead = [
            t
            for (t, _), r in zip(tokens, results, strict=True)
            if getattr(r, "dead", False)
        ]
        for (token, _), r in zip(tokens, results, strict=True):
            if isinstance(r, BaseException):
                log.warning("push to %s… failed: %s", token[:8], r)
            elif r.status != 200:
                log.warning("push to %s… refused: %s %s", token[:8], r.status, r.reason)
        if dead:
            with Session(self.engine) as session:
                for token in dead:
                    row = session.get(PushToken, token)
                    if row is not None:
                        session.delete(row)
                session.commit()


def _unread_counts(session: Session, user_ids: set[str]) -> dict[str, int]:
    """Unread notifications per user (missing means none): the app badge."""
    query = (
        select(Notification.user_id, func.count())
        .where(
            col(Notification.user_id).in_(user_ids),
            col(Notification.read_at).is_(None),
        )
        .group_by(col(Notification.user_id))
    )
    return {uid: count for uid, count in session.exec(query).all()}
