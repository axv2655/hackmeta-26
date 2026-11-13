"""Every route module, included once. Frozen after T0: lanes add endpoints
inside their own route module and never edit this file."""

from fastapi import APIRouter

from app.api.routes import (
    areas,
    audience,
    auth,
    calendar,
    circles,
    demo,
    friends,
    glasses,
    home,
    invites,
    leaderboards,
    marks,
    moments,
    moves,
    muse,
    notes,
    notifications,
    proximity,
    pseudo_groups,
    push,
    ratings,
    reels,
    suggestions,
    users,
    ws,
)

api_router = APIRouter()
api_router.include_router(home.router)
api_router.include_router(notes.router)

# core
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(friends.router)
api_router.include_router(circles.router)
api_router.include_router(audience.router)
api_router.include_router(marks.router)
api_router.include_router(areas.router)
api_router.include_router(moves.router)
api_router.include_router(moments.router)
api_router.include_router(ws.router)

# muse
api_router.include_router(muse.router)
api_router.include_router(notifications.router)
api_router.include_router(suggestions.router)
api_router.include_router(pseudo_groups.router)

# surfaces
api_router.include_router(proximity.router)
api_router.include_router(reels.router)
api_router.include_router(calendar.router)
api_router.include_router(ratings.router)
api_router.include_router(leaderboards.router)
api_router.include_router(glasses.router)
api_router.include_router(demo.router)

# messages (ARCHITECTURE.md 9.4, 9.5)
api_router.include_router(invites.router)
api_router.include_router(push.router)
