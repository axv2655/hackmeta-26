"""Semantic wire contract; component/module names are not client behavior."""

import json
import os
from pathlib import Path

from app.main import create_app

FIXTURE = Path(__file__).parent / "fixtures/core-openapi.json"


def contract():
    spec = create_app().openapi()

    def normalize(value):
        if isinstance(value, dict):
            if "$ref" in value:
                name = value["$ref"].rsplit("/", 1)[-1]
                return normalize(spec["components"]["schemas"][name])
            return {
                k: normalize(v)
                for k, v in value.items()
                if k not in {"title", "description", "summary", "operationId", "tags"}
            }
        if isinstance(value, list):
            return [normalize(v) for v in value]
        return value

    return {
        path: normalize(operations)
        for path, operations in spec["paths"].items()
        if "/media/" not in path
    }


def test_core_api_contract_preserves_shapes():
    # Every core path keeps its exact shape. Other lanes (muse, surfaces,
    # messages) may add paths of their own; those are not part of this snapshot.
    # REGEN_CONTRACT=1 rewrites the snapshot from the current app instead.
    actual = contract()
    if os.environ.get("REGEN_CONTRACT") == "1":
        FIXTURE.write_text(json.dumps(actual, indent=2, sort_keys=True) + "\n")
        return
    expected = json.loads(FIXTURE.read_text())
    assert sorted(set(expected) - set(actual)) == []
    assert {path: actual[path] for path in expected} == expected
