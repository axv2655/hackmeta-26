"""Keep caller-supplied coordinates out of the server's access log.

`/moves/nearby` and `/marks/nearby` take `lat/lng` in the query string, and
the access log would otherwise keep them at full precision before the handler
rounds them (ARCHITECTURE.md 12.1). The filter drops the query string of those
paths only; nothing else is logged or stored.
"""

import logging

NEARBY_PATHS = ("/moves/nearby", "/marks/nearby")


def strip_nearby_query(target: str) -> str:
    path, sep, _ = target.partition("?")
    return f"{path}?<redacted>" if sep and path.endswith(NEARBY_PATHS) else target


class RedactNearbyQuery(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            record.args = (*args[:2], strip_nearby_query(args[2]), *args[3:])
        return True


def redact_nearby_queries() -> None:
    """Idempotently attach the filter to uvicorn's access logger."""
    logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, RedactNearbyQuery) for f in logger.filters):
        logger.addFilter(RedactNearbyQuery())
