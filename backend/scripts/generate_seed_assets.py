"""Regenerate the bundled demo images in `app/seed/assets/`.

The images are original, procedurally drawn artwork (a colour gradient with a
soft sun/moon disc and layered hills) written as plain PNG with the standard
library only, so they carry no third-party licence and need no image tooling.
Run `uv run python scripts/generate_seed_assets.py` after changing a palette.
"""

import json
import math
import struct
import zlib
from pathlib import Path

ASSETS = Path(__file__).resolve().parents[1] / "app" / "seed" / "assets"

# (top colour, bottom colour, accent) per Mark category.
MARKS: dict[str, tuple[tuple[int, int, int], ...]] = {
    "food": ((255, 183, 94), (214, 69, 65), (255, 240, 200)),
    "coffee": ((196, 154, 108), (84, 52, 36), (250, 235, 215)),
    "study": ((120, 144, 230), (40, 52, 120), (230, 236, 255)),
    "fitness": ((94, 224, 160), (16, 112, 96), (220, 255, 240)),
    "nightlife": ((176, 96, 240), (36, 14, 84), (255, 214, 250)),
    "outdoors": ((140, 216, 120), (28, 100, 60), (255, 250, 200)),
    "games": ((255, 130, 110), (120, 30, 90), (255, 230, 150)),
    "shopping": ((255, 160, 200), (150, 50, 120), (255, 240, 248)),
    "errand": ((150, 190, 210), (44, 84, 110), (240, 250, 255)),
    "other": ((190, 190, 205), (70, 72, 96), (250, 250, 255)),
}

# Moment id -> (palette, sun x, sun y, hill phase).
MOMENTS: dict[str, tuple[tuple[tuple[int, int, int], ...], float, float, float]] = {
    "mo_last_night_sunset": (
        ((255, 150, 80), (90, 40, 120), (255, 232, 160)),
        0.7,
        0.55,
        0.0,
    ),
    "mo_last_night_skyline": (
        ((70, 90, 190), (14, 18, 52), (255, 214, 120)),
        0.3,
        0.3,
        1.3,
    ),
    "mo_last_night_toast": (
        ((250, 196, 110), (150, 56, 70), (255, 246, 214)),
        0.5,
        0.4,
        2.1,
    ),
    "mo_last_night_candid": (
        ((255, 170, 190), (110, 60, 130), (255, 240, 235)),
        0.25,
        0.6,
        3.0,
    ),
    "mo_kumo_first_sip": (
        ((200, 220, 150), (60, 100, 70), (255, 255, 220)),
        0.75,
        0.3,
        4.2,
    ),
}


def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def render(width, height, palette, sun_x, sun_y, phase):
    top, bottom, accent = palette
    radius = min(width, height) * 0.16
    cx, cy = sun_x * width, sun_y * height
    rows = []
    for y in range(height):
        row = bytearray()
        for x in range(width):
            pixel = _mix(top, bottom, y / (height - 1))
            glow = max(0.0, 1 - math.hypot(x - cx, y - cy) / (radius * 3))
            pixel = _mix(pixel, accent, glow * 0.35)
            if math.hypot(x - cx, y - cy) < radius:
                pixel = _mix(pixel, accent, 0.9)
            for layer in range(3):
                ridge = (
                    height * (0.62 + 0.1 * layer)
                    + math.sin(x / width * math.tau * (1 + layer) + phase + layer)
                    * height
                    * 0.05
                )
                if y > ridge:
                    shade = 0.28 + 0.2 * layer
                    pixel = _mix(pixel, (0, 0, 0), shade)
            row.extend(int(max(0, min(255, c))) for c in pixel)
        rows.append(bytes(row))
    return rows


def png(rows, width, height):
    raw = bytearray()
    previous = bytes(width * 3)
    for row in rows:  # filter 2 (Up): smooth gradients compress well
        raw.append(2)
        raw.extend((row[i] - previous[i]) & 255 for i in range(len(row)))
        previous = row

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    manifest: dict[str, dict[str, str]] = {"marks": {}, "moments": {}}
    for index, (category, palette) in enumerate(MARKS.items()):
        name = f"{category}.png"
        rows = render(640, 480, palette, 0.3 + 0.04 * index, 0.35, index * 0.7)
        (ASSETS / "marks" / name).write_bytes(png(rows, 640, 480))
        manifest["marks"][category] = f"marks/{name}"
    for moment_id, (palette, sx, sy, phase) in MOMENTS.items():
        rows = render(480, 640, palette, sx, sy, phase)
        (ASSETS / "moments" / f"{moment_id}.png").write_bytes(png(rows, 480, 640))
        manifest["moments"][moment_id] = f"moments/{moment_id}.png"
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
