These icons reuse the checked-in assets from `frontend/web`.

Run `node scripts/sync-meta-icons.mjs` from `frontend/mobile` to regenerate the
SVG strings and copy the sidebar sprite. `Icon.tsx` uses the web SVGs for matching
Facebook controls. `MetaShortcutIcon.tsx` uses the web sidebar's original 36px
cells, including Memories. Custom Moves icons and unmatched controls retain
their existing glyphs.
