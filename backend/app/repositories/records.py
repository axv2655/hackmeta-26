"""Copy ORM rows into detached records and records back to rows."""
from copy import deepcopy
from dataclasses import asdict

from app import tables
from app.domain import records


def record(row):
    if row is None:
        return None
    cls = getattr(records, type(row).__name__)
    return cls(**{k: deepcopy(getattr(row, k)) for k in type(row).model_fields})


def store(session, value):
    cls = getattr(tables, type(value).__name__)
    session.merge(cls(**asdict(value)))
    session.flush()
