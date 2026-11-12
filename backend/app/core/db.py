"""Database integration placeholder.

When persistence is needed:
  1. Add `sqlalchemy`, `psycopg[binary]`, and `alembic` to pyproject.toml.
  2. Build the engine and session factory here from `settings.DATABASE_URL`.
  3. Write a `SqlNoteRepository` in `app/repositories/notes.py` that takes a
     session and satisfies the `NoteRepository` Protocol.
  4. In `app/api/deps.py`, yield a session per request and build the SQL
     adapter around it instead of the in-memory one.
Nothing in `app/services/` or `app/api/routes/` needs to change.
"""
