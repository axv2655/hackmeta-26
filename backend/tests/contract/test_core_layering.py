"""Keep application use cases independent of SQL and transport adapters."""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'app'

# Services owned by other lanes still read tables directly. The rule covers the
# core lane's use cases; moving these behind repositories is a follow-up.
NOT_YET_LAYERED = {'notify.py', 'suggestions.py', 'taste.py', 'invites.py'}


def test_services_do_not_depend_on_sql():
    violations = []
    for path in (ROOT / 'services').glob('*.py'):
        if path.name in NOT_YET_LAYERED:
            continue
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                module = node.module or ''
                if module != "app.core.areas" and module.startswith(
                    ("sqlalchemy", "sqlmodel", "app.tables", "app.core")
                ):  # app.core.areas is pure configuration plus a lookup
                    violations.append(f'{path.name}:{node.lineno} {module}')
                if any(n.name.startswith('Sql') for n in node.names):
                    violations.append(f'{path.name}:{node.lineno} concrete adapter')
    assert not violations, '\n'.join(violations)


def test_domain_has_no_outer_dependencies():
    for path in (ROOT / 'domain').glob('*.py'):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom):
                assert not (node.module or '').startswith((
                    'sqlalchemy', 'sqlmodel', 'pydantic', 'fastapi',
                    'app.services', 'app.repositories', 'app.tables', 'app.api'))
