import { useState } from 'react'
import { createPortal } from 'react-dom'
import * as L from 'lucide-react'
import { MediaImg, StoryViewer } from './Snapshot'

// The Move Recap card: a Move's Moments as a mosaic, one line about it, "Do It Again", and a bar to add
// more. Used on the Moves panel (MoveCard) and in Memories. Tapping a photo opens the story viewer.

const MOSAIC_MAX = 3

/** "Maya", "Maya and Dev", "Maya, Dev and 2 others". */
export const withLine = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`)

// 1 photo: full width. 2: side by side. 3+: one tall on the left, two stacked on the right.
function Mosaic({ photos, onOpen }) {
  const shown = photos.slice(0, MOSAIC_MAX)
  return (
    <div className={`recap-mosaic n${shown.length}`}>
      {shown.map((m, i) => (
        <button key={m.id} className="recap-photo" onClick={() => onOpen(i)} aria-label={`Open photo by ${m.author.first_name}`}>
          <MediaImg src={m.media_url} alt="" />
          {i === 0 && photos.length > 1 && <span className="recap-count"><L.Image size={13} /> {photos.length}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * photos: Moments, newest first. sub: "Pickleball · Fri, May 16". caption: one line, or null.
 * again: { sub, onClick } for "Do It Again", or null. onSnap: opens the live camera (only while in the Move).
 * onFiles: uploads picked photos, or null when this viewer cannot add any. empty: text when there are no photos.
 */
export function MoveRecap({ photos, sub, caption, again, onSnap, onFiles, empty, error }) {
  const [open, setOpen] = useState(null)
  return (
    <section className="recap" aria-label="Move Recap">
      <div className="recap-head">
        <span className="recap-spark" aria-hidden="true"><L.Sparkles size={18} /></span>
        <span className="grow">
          <b className="block">Move Recap</b>
          <span className="muted small block">{sub}</span>
        </span>
      </div>
      {error && <p className="muted small">{error}</p>}
      {photos.length > 0 ? <Mosaic photos={photos} onOpen={setOpen} /> : <p className="muted small recap-empty">{empty}</p>}
      {caption && <p className="recap-caption"><L.Sparkles size={15} /> {caption}</p>}
      {again && (
        <button className="recap-again" onClick={again.onClick}>
          <span className="recap-again-icon" aria-hidden="true"><L.RefreshCw size={18} /></span>
          <span className="grow"><b className="block">Do It Again</b><span className="muted small">{again.sub}</span></span>
          <L.ChevronRight size={18} className="muted" />
        </button>
      )}
      {(onSnap || onFiles) && (
        <div className="recap-add">
          {onSnap && <button className="recap-icon" aria-label="Take a snapshot" onClick={onSnap}><L.Camera size={18} /></button>}
          {onFiles ? (
            <label className="recap-input">
              Add to the recap...
              <input className="sr-only" type="file" accept="image/*" multiple onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />
            </label>
          ) : <button className="recap-input" onClick={onSnap}>Add to the recap...</button>}
          {onFiles && (
            <label className="recap-icon" aria-label="Add photos from your device">
              <L.ImagePlus size={18} />
              <input className="sr-only" type="file" accept="image/*" multiple onChange={(e) => { onFiles([...e.target.files]); e.target.value = '' }} />
            </label>
          )}
        </div>
      )}
      {open !== null && createPortal(<StoryViewer snaps={photos.map((m) => [m.media_url, m.author.first_name])} start={open} onClose={() => setOpen(null)} />, document.body)}
    </section>
  )
}
