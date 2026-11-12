"""Semantic wire contract; component/module names are not client behavior."""
import json
from pathlib import Path

from app.main import create_app

FIXTURE = Path(__file__).parent / 'fixtures/core-openapi.json'


def contract():
    spec = create_app().openapi()

    def normalize(value):
        if isinstance(value, dict):
            if '$ref' in value:
                name = value['$ref'].rsplit('/', 1)[-1]
                return normalize(spec['components']['schemas'][name])
            return {
                k: normalize(v)
                for k, v in value.items()
                if k not in {"title", "description", "summary", "operationId", "tags"}
            }
        if isinstance(value, list):
            return [normalize(v) for v in value]
        return value

    return {path: normalize(operations) for path, operations in spec['paths'].items()
            if '/media/' not in path}


def test_core_api_contract_preserves_shapes():
    assert contract() == json.loads(FIXTURE.read_text())
