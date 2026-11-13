"""A small APNs client: token-based auth (.p8 key, ES256 JWT) over HTTP/2.

https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx
import jwt

HOSTS = {
    True: "https://api.sandbox.push.apple.com",
    False: "https://api.push.apple.com",
}
JWT_TTL_S = 50 * 60  # Apple refuses tokens older than an hour

# Reasons that mean the token will never work again: forget it.
DEAD_REASONS = frozenset({"BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"})


@dataclass(frozen=True, slots=True)
class ApnsResult:
    status: int
    reason: str | None = None

    @property
    def dead(self) -> bool:
        return self.status == 410 or self.reason in DEAD_REASONS


class ApnsClient:
    def __init__(
        self,
        key_pem: str,
        key_id: str,
        team_id: str,
        topic: str,
        client: httpx.AsyncClient | None = None,
        now: Callable[[], float] = time.time,
    ) -> None:
        self.key_pem, self.key_id, self.team_id, self.topic = (
            key_pem,
            key_id,
            team_id,
            topic,
        )
        self._client = client
        self._now = now
        self._jwt: tuple[str, float] | None = None

    def bearer(self) -> str:
        now = self._now()
        if self._jwt is None or now - self._jwt[1] > JWT_TTL_S:
            token = jwt.encode(
                {"iss": self.team_id, "iat": int(now)},
                self.key_pem,
                algorithm="ES256",
                headers={"kid": self.key_id},
            )
            self._jwt = (token, now)
        return self._jwt[0]

    async def send(
        self, device_token: str, payload: dict[str, Any], sandbox: bool
    ) -> ApnsResult:
        if self._client is None:
            self._client = httpx.AsyncClient(http2=True, timeout=10)
        res = await self._client.post(
            f"{HOSTS[sandbox]}/3/device/{device_token}",
            json=payload,
            headers={
                "authorization": f"bearer {self.bearer()}",
                "apns-topic": self.topic,
                "apns-push-type": "alert",
                "apns-priority": "10",
            },
        )
        if res.status_code == 200:
            return ApnsResult(200)
        try:
            reason = res.json().get("reason")
        except ValueError:
            reason = None
        return ApnsResult(res.status_code, reason)


def alert_payload(title: str, body: str, data: dict[str, str]) -> dict[str, Any]:
    """`aps` for the banner, plus the deep-link data (e.g. move_id) on top."""
    return {
        "aps": {"alert": {"title": title, "body": body}, "sound": "default"},
        **data,
    }
