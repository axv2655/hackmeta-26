"""Seed step owned by the surfaces lane (S11).

Writes 8 weeks of ended Moves and hangouts.
"""

from sqlmodel import Session

from app.ports import Clock


def seed(session: Session, clock: Clock) -> None:
    """Not implemented yet; leaves its tables empty."""
