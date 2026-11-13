# Bundled demo images

Every image here is original artwork drawn by `backend/scripts/generate_seed_assets.py`
(a colour gradient, a soft sun or moon disc and layered hills, written with the
Python standard library). They are project-owned, have no third-party licence
and need no network access.

| Path | Used for |
| --- | --- |
| `marks/<category>.png` | Public Mark photos, one per category. Served unauthenticated at `/media/seed/marks/<category>.png`. |
| `moments/<moment_id>.png` | Seeded Moments. **Private**: copied into `MEDIA_DIR` as `<moment_id>.png` and served only through the authorized `/media/{filename}` route. |
| `manifest.json` | The allowlist. Only files named here are ever served or copied. |

Regenerate with `uv run python scripts/generate_seed_assets.py` from `backend/`.
Replace any file with real photography (clearly licensed, noted here) by keeping
its manifest path.
