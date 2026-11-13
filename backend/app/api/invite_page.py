"""The page a shared link opens: no login, like a Luma or Eventbrite link.

GET  /m/{token}         the Move: place, what's up, who's there, map links
POST /m/{token}/going   form post with a first name -> "You're in"

Mounted at the site root (not under /api/v1) so links stay short. Open Graph
tags give iMessage its preview card. Each link belongs to one recipient and
stops showing details when the Move ends (ARCHITECTURE.md 9.4).
"""

from __future__ import annotations

from datetime import datetime
from html import escape
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse

from app.api.deps import ContainerDep
from app.core.db import SessionDep
from app.domain.invites import InvalidInvite, InviteError, InviteNotFound
from app.services.invites import InvitePage, InviteService

router = APIRouter(tags=["invite-page"], include_in_schema=False)

CATEGORY_EMOJI = {
    "food": "🍜",
    "coffee": "☕️",
    "study": "📚",
    "fitness": "🏋️",
    "nightlife": "🌙",
    "outdoors": "🌳",
    "games": "🎮",
    "shopping": "🛍️",
    "errand": "🧺",
    "other": "📍",
}
BOT_MARKERS = ("bot", "facebookexternalhit", "preview", "slurp", "crawler")
HEADERS = {"X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer"}


def _is_preview_fetch(request: Request) -> bool:
    agent = request.headers.get("user-agent", "").lower()
    return any(marker in agent for marker in BOT_MARKERS)


@router.get("/m/{token}", response_class=HTMLResponse)
def invite_page(
    token: str,
    request: Request,
    session: SessionDep,
    container: ContainerDep,
) -> HTMLResponse:
    service = InviteService(session, container)
    try:
        page = service.page(token, count_open=not _is_preview_fetch(request))
    except InviteNotFound:
        return _html(render_missing(), status.HTTP_404_NOT_FOUND)
    now = container.clock.now()
    return _html(render(page, now))


@router.post("/m/{token}/going", response_model=None)
async def invite_going(
    token: str,
    name: Annotated[str, Form(max_length=80)],
    session: SessionDep,
    container: ContainerDep,
) -> HTMLResponse | RedirectResponse:
    service = InviteService(session, container)
    try:
        await service.going(token, name)
    except InviteNotFound:
        return _html(render_missing(), status.HTTP_404_NOT_FOUND)
    except InvalidInvite as exc:
        page = service.page(token, count_open=False)
        return _html(render(page, container.clock.now(), error=str(exc)), 422)
    except InviteError:
        page = service.page(token, count_open=False)
        return _html(render(page, container.clock.now()), status.HTTP_409_CONFLICT)
    return RedirectResponse(f"/m/{token}?going=1", status.HTTP_303_SEE_OTHER)


def _html(body: str, code: int = 200) -> HTMLResponse:
    return HTMLResponse(body, status_code=code, headers=HEADERS)


# --- rendering ---------------------------------------------------------------


def ago(start: datetime | None, now: datetime) -> str:
    if start is None:
        return ""
    minutes = int((now - start).total_seconds() // 60)
    if minutes < 1:
        return "Started just now"
    if minutes < 60:
        return f"Started {minutes} min ago"
    return f"Started {minutes // 60} h ago"


def who_line(page: InvitePage) -> str:
    names = list(dict.fromkeys([*page.people, *page.guests]))
    if not names:
        return f"{page.creator_first or page.inviter_first} is heading there"
    if len(names) <= 3:
        shown = ", ".join(names[:-1]) + (" and " if len(names) > 1 else "") + names[-1]
    else:
        shown = f"{', '.join(names[:2])} and {len(names) - 2} others"
    return f"{shown} {'is' if len(names) == 1 else 'are'} there or on the way"


def render(page: InvitePage, now: datetime, *, error: str = "") -> str:
    if not page.live:
        return _shell(
            "This Move has wrapped up",
            "",
            f"""<main class="card center">
  <div class="emoji">👋</div>
  <h1>This Move has wrapped up</h1>
  <p class="muted">Everyone's headed home. Next time {escape(page.inviter_first)} texts you, pull up sooner.</p>
</main>""",
        )
    e = escape
    host = page.creator_first or page.inviter_first
    title = f"{host} is making a move to {page.mark_name}"
    q = quote(page.mark_name)
    apple = f"https://maps.apple.com/?q={q}&ll={page.lat},{page.lng}"
    google = f"https://www.google.com/maps/search/?api=1&query={page.lat},{page.lng}"
    photo = (
        f'<img class="photo" src="{e(page.photo_url)}" alt="" onerror="this.remove()">'
        if page.photo_url and page.photo_url.startswith("https://")
        else ""
    )
    og_image = (
        f'<meta property="og:image" content="{e(page.photo_url)}">'
        if page.photo_url and page.photo_url.startswith("https://")
        else ""
    )
    if page.guest_name:
        action = f"""<div class="done">✅ You're in, {e(page.guest_name)}. {e(host)} knows you're coming.</div>"""
    else:
        action = f"""<form method="post" action="/m/{e(page.token)}/going">
    <label for="name">Your first name</label>
    <input id="name" name="name" autocomplete="given-name" maxlength="40" required placeholder="So they know who's coming">
    {f'<p class="error">{e(error)}</p>' if error else ""}
    <button type="submit">I'm pulling up</button>
  </form>"""
    body = f"""<main class="card">
  {photo}
  <p class="eyebrow">{CATEGORY_EMOJI.get(page.category, "📍")} {e(ago(page.starts_at, now))}</p>
  <h1>{e(title)}</h1>
  <blockquote>“{e(page.move_text)}”</blockquote>
  <p class="who">{e(who_line(page))}</p>
  <div class="place">
    <strong>{e(page.mark_name)}</strong>
    {f'<span class="muted">{e(page.mark_address)}</span>' if page.mark_address else ""}
    <div class="maps"><a href="{e(apple)}">Apple Maps</a><a href="{e(google)}">Google Maps</a></div>
  </div>
  {action}
</main>
<footer>
  <p>Shared with you by {e(page.inviter_first)}. Only people with this link can see it, and it stops working when the Move ends.</p>
  <p><a href="hackmeta26://moves">Have the app? Open Moves</a> · Signing in is optional.</p>
</footer>"""
    head = f"""<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="“{e(page.move_text)}” · You want to pull up?">
<meta property="og:type" content="website">
{og_image}"""
    return _shell(title, head, body)


def render_missing() -> str:
    return _shell(
        "Link not found",
        "",
        """<main class="card center"><div class="emoji">🔗</div>
  <h1>This link doesn't work</h1>
  <p class="muted">Ask whoever sent it for a new one.</p></main>""",
    )


CSS = """
:root{--bg:#F0F2F5;--card:#fff;--text:#080809;--muted:#65686C;--blue:#0866FF;--line:#E4E6EB;--ok:#E7F3EC;--okText:#1F6B3A}
@media (prefers-color-scheme:dark){:root{--bg:#18191A;--card:#242526;--text:#E4E6EB;--muted:#B0B3B8;--line:#3A3B3C;--ok:#1F3326;--okText:#8FD19E}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.card{max-width:480px;margin:16px auto;background:var(--card);border-radius:16px;padding:20px 16px;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.center{text-align:center}.emoji{font-size:40px}
.photo{width:100%;height:180px;object-fit:cover;border-radius:12px;margin-bottom:12px}
.eyebrow{margin:0 0 4px;color:var(--muted);font-size:14px}
h1{font-size:22px;line-height:1.25;margin:0 0 10px}
blockquote{margin:0 0 12px;font-size:18px}
.who{margin:0 0 14px;color:var(--muted)}
.place{border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:12px 0;margin-bottom:16px;display:flex;flex-direction:column;gap:2px}
.maps{display:flex;gap:16px;margin-top:6px}.maps a{color:var(--blue);font-weight:600;text-decoration:none}
label{display:block;font-weight:600;margin-bottom:6px}
input{width:100%;font:inherit;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)}
button{width:100%;margin-top:12px;font:inherit;font-weight:700;color:#fff;background:var(--blue);border:0;border-radius:12px;padding:14px;cursor:pointer}
.done{background:var(--ok);color:var(--okText);border-radius:12px;padding:12px;font-weight:600;margin-bottom:10px}
.error{color:#C4161C;margin:8px 0 0}.muted{color:var(--muted)}
footer{max-width:480px;margin:0 auto 32px;padding:0 16px;color:var(--muted);font-size:13px}footer a{color:var(--blue)}
"""


def _shell(title: str, head: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{escape(title)}</title>
{head}
<style>{CSS}</style>
</head><body>
{body}
</body></html>"""
