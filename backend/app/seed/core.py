"""Seed step owned by the core lane (C10).

Writes users, friendships, Circles, Marks, live Moves, ghosts, Moments.
"""

from sqlmodel import Session

from app.ports import Clock


def seed(session: Session, clock: Clock) -> None:
    """Not implemented yet; leaves its tables empty."""
