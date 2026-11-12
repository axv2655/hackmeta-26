"""Bundled demo imagery, read through `importlib.resources` so it works from an
installed wheel with no network.

Two kinds, with different privacy:

* Mark photos are public. `mark_photo_url` points at the allowlisted route
  `/media/seed/marks/{asset_name}`; `public_mark_asset` is that allowlist.
* Moment files are private. `materialize_moment` copies one into `MEDIA_DIR`
  as `{moment_id}.png`, exactly where an upload would live, so the authorized
  `/media/{filename}` route is the only way to read it.
"""

import json
from functools import cache
from importlib import resources
from importlib.resources.abc import Traversable
from pathlib import Path

MARK_ROUTE = "/media/seed/marks"


def _root() -> Traversable:
    return resources.files("app.seed").joinpath("assets")


@cache
def manifest() -> dict[str, dict[str, str]]:
    return json.loads(_root().joinpath("manifest.json").read_text())


def mark_asset_name(category: str) -> str:
    """File name of the shared Mark image for a category (`other` if unknown)."""
    marks = manifest()["marks"]
    return Path(marks.get(category) or marks["other"]).name


def mark_photo_url(category: str) -> str:
    return f"{MARK_ROUTE}/{mark_asset_name(category)}"


def public_mark_asset(asset_name: str) -> bytes | None:
    """Bytes of a manifest-listed Mark image, or None for any other name."""
    listed = {Path(path).name: path for path in manifest()["marks"].values()}
    path = listed.get(asset_name)
    if path is None or Path(asset_name).name != asset_name:
        return None
    return _root().joinpath(path).read_bytes()


def moment_filename(moment_id: str) -> str:
    return f"{moment_id}{Path(manifest()['moments'][moment_id]).suffix}"


def materialize_moment(moment_id: str, media_dir: Path) -> str:
    """Write the bundled file for a seeded Moment into `media_dir`; return its
    file name. Only this Moment's own file is (re)written."""
    data = _root().joinpath(manifest()["moments"][moment_id]).read_bytes()
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = moment_filename(moment_id)
    (media_dir / filename).write_bytes(data)
    return filename
