"""Private file storage. Authorization is always checked before resolving bytes."""
from pathlib import Path
from typing import Protocol


class MediaStore(Protocol):
    def write(self, filename: str, data: bytes) -> None: ...
    def remove(self, filename: str) -> None: ...
    def resolve(self, filename: str) -> Path | None: ...


class LocalMediaStore:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, filename: str) -> Path:
        if Path(filename).name != filename:
            raise ValueError('invalid media filename')
        path = self.root / filename
        if path.is_symlink():
            raise ValueError('media symlinks are not supported')
        return path

    def write(self, filename, data):
        path = self._path(filename)
        self.root.mkdir(parents=True, exist_ok=True)
        try:
            path.write_bytes(data)
        except Exception:
            path.unlink(missing_ok=True)
            raise

    def remove(self, filename):
        self._path(filename).unlink(missing_ok=True)

    def resolve(self, filename):
        try:
            path = self._path(filename)
        except ValueError:
            return None
        return path if path.is_file() else None
