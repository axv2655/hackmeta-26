"""Static check that no lane imports another lane's modules.

The module map mirrors docs/BACKEND_TASKS.md section 2. Shared contract
modules (`ALWAYS_ALLOWED`) may be imported by anyone, and modules no lane owns
(for example `app.container`, `app.api.deps`) are not policed.
"""

import ast
from fnmatch import fnmatchcase
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]


def _routes(*names: str) -> tuple[str, ...]:
    return tuple(f"app.api.routes.{name}" for name in names)


def _modules(package: str, *names: str) -> tuple[str, ...]:
    return tuple(f"{package}.{name}" for name in names)


LANES: dict[str, tuple[str, ...]] = {
    "core": (
        "app.core",
        "app.core.*",
        *_modules("app.domain", "moves", "privacy", "errors", "records"),
        *_modules(
            "app.repositories",
            "moves",
            "marks",
            "audience",
            "users",
            "circles",
            "moments",
            "media",
            "records",
            "unit_of_work",
        ),
        *_modules(
            "app.models", "users", "circles", "audience", "marks", "moves", "moments"
        ),
        *_modules(
            "app.services", "moves", "marks", "audience", "users", "moments", "circles"
        ),
        "app.realtime",
        "app.realtime.*",
        "app.seed.core",
        "app.seed.media",
        "app.seed.assets.*",
        *_routes("auth", "users", "circles", "audience", "marks", "moves"),
        *_routes("moments", "ws", "media"),
        "app.api.deps_core",
        "app.lanes.core",
        "tests.core",
        "tests.core.*",
    ),
    "muse": (
        "app.muse",
        "app.muse.*",
        *_modules("app.domain", "affinity", "pseudo_groups"),
        *_modules("app.services", "notify", "suggestions", "taste"),
        *_routes("muse", "notifications", "suggestions", "pseudo_groups"),
        "app.lanes.muse",
        "tests.muse",
        "tests.muse.*",
    ),
    "surfaces": (
        "app.domain.ranking",
        *_modules(
            "app.services",
            "proximity",
            "proximity_sweep",
            "open_moves",
            "reels",
            "calendar",
            "ratings",
            "leaderboards",
            "hangouts",
            "glasses",
            "demo",
        ),
        *_modules("app.seed", "surfaces", "history"),
        *_routes("proximity", "reels", "calendar", "ratings", "leaderboards"),
        *_routes("glasses", "demo"),
        "app.lanes.surfaces",
        "tests.surfaces",
        "tests.surfaces.*",
    ),
}

ALWAYS_ALLOWED = (
    "app.ports",
    "app.tables",
    "app.tables.*",
    "app.hooks",
    "app.core",
    "app.core.*",
    "app.seed.ids",
)


def _matches(module: str, patterns: tuple[str, ...]) -> bool:
    return any(fnmatchcase(module, pattern) for pattern in patterns)


def lane_of(module: str) -> str | None:
    for lane, patterns in LANES.items():
        if _matches(module, patterns):
            return lane
    return None


def imported_modules(source: str, module: str, *, is_package: bool) -> set[str]:
    """Absolute names of every module `source` may import, relative ones resolved.

    For `from pkg import name`, both `pkg` and `pkg.name` are reported since
    `name` may be a submodule.
    """
    package = module if is_package else module.rpartition(".")[0]
    found: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                parts = package.split(".")
                base = ".".join(parts[: len(parts) - node.level + 1])
                target = f"{base}.{node.module}" if node.module else base
            else:
                target = node.module or ""
            found.add(target)
            found.update(f"{target}.{alias.name}" for alias in node.names)
    return found


def violations(source: str, module: str, *, is_package: bool = False) -> list[str]:
    own = lane_of(module)
    if own is None:
        return []
    bad = []
    for target in sorted(imported_modules(source, module, is_package=is_package)):
        other = lane_of(target)
        if other not in (None, own) and not _matches(target, ALWAYS_ALLOWED):
            bad.append(f"{module} ({own}) imports {target} ({other})")
    return bad


def _source_files() -> list[tuple[str, Path]]:
    files = []
    for root in ("app", "tests"):
        for path in sorted((BACKEND / root).rglob("*.py")):
            parts = path.relative_to(BACKEND).with_suffix("").parts
            if parts[-1] == "__init__":
                parts = parts[:-1]
            files.append((".".join(parts), path))
    return files


def test_no_lane_imports_another_lane() -> None:
    found = [
        problem
        for module, path in _source_files()
        for problem in violations(
            path.read_text(encoding="utf-8"),
            module,
            is_package=path.name == "__init__.py",
        )
    ]
    assert found == []


@pytest.mark.parametrize(
    ("source", "module"),
    [
        ("from app.services.notify import NotifyService", "app.services.moves"),
        ("import app.api.routes.moves", "app.lanes.surfaces"),
        ("from app.services import reels", "app.muse.agents.flare"),
        ("from .notify import NotifyService", "app.services.ratings"),
        ("from tests.core.fakes import FakeClock", "tests.muse.test_runner"),
    ],
)
def test_cross_lane_import_is_caught(source: str, module: str) -> None:
    assert violations(source, module)


@pytest.mark.parametrize(
    ("source", "module"),
    [
        ("from app.ports import MoveGateway", "app.services.notify"),
        ("from app.tables.core import Move", "app.services.hangouts"),
        ("from app.core.clock import DemoClock", "app.services.demo"),
        ("from app.seed import ids", "app.seed.history"),
        ("from app.hooks import Hooks", "app.lanes.muse"),
        ("from app.domain.moves import is_stale", "app.services.moves"),
        ("from app.services.notify import NotifyService", "app.api.deps"),
    ],
)
def test_allowed_imports_pass(source: str, module: str) -> None:
    assert violations(source, module) == []
