import { useEffect, useRef, useState } from 'react'
import * as L from 'lucide-react'
import { useMedia } from './api'

// Snapshots: Instagram-Instants-style photos taken live while you are in a Move.
// Each one is posted to the backend as a Moment of that Move (see Moves.jsx).

/** Full-screen viewfinder with one shutter. Calls onCapture with a JPEG data URL. */
export function SnapshotCamera({ onCapture, onClose }) {
  const video = useRef(null)
  const [state, setState] = useState(() => (navigator.mediaDevices?.getUserMedia ? 'starting' : 'none')) // starting | live | blocked | none
  useEffect(() => {
    let stream
    let gone = false
    if (!navigator.mediaDevices?.getUserMedia) return undefined
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (gone) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        video.current.srcObject = s
        setState('live')
      })
      .catch((e) => setState(e?.name === 'NotFoundError' ? 'none' : 'blocked'))
    return () => { gone = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const shoot = () => {
    const v = video.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const g = c.getContext('2d')
    // the preview is mirrored like a selfie camera, so save it the way the user saw it
    g.translate(c.width, 0)
    g.scale(-1, 1)
    g.drawImage(v, 0, 0)
    onCapture(c.toDataURL('image/jpeg', 0.85))
  }
  return (
    <div className="snap-cam" role="dialog" aria-modal="true" aria-label="Take a snapshot">
      <video ref={video} className={state === 'live' ? '' : 'hide'} autoPlay playsInline muted />
      {state !== 'live' && (
        <p className="snap-cam-msg">
          {state === 'starting' && 'Starting camera...'}
          {state === 'blocked' && 'Camera access is off. Allow the camera for this site in your browser settings, then try again.'}
          {state === 'none' && 'No camera found on this device.'}
        </p>
      )}
      <button className="snap-cam-close" aria-label="Close camera" onClick={onClose}><L.X size={24} /></button>
      <button className="snap-shutter" aria-label="Take snapshot" disabled={state !== 'live'} onClick={shoot} />
    </div>
  )
}

/** The Move's snapshots, newest first, plus the shutter button when you are in the Move. */
export function SnapStrip({ snaps, canSnap, onSnap, empty }) {
  if (!snaps.length && !canSnap) return null
  return (
    <section className="snap-strip" aria-label="Snapshots">
      <div className="row between"><h4>Snapshots</h4>{canSnap && <button className="btn-gray snap-btn" onClick={onSnap}><L.Camera size={16} /> Snapshot</button>}</div>
      {snaps.length > 0
        ? <div className="snap-row">{snaps.map(([src, by], i) => <figure key={src} className="snap" style={{ '--tilt': `${i % 2 ? 2 : -2}deg` }}><MediaImg src={src} alt={`Snapshot by ${by}`} /><figcaption>{by}</figcaption></figure>)}</div>
        : <p className="muted small">{empty}</p>}
    </section>
  )
}

/** <img> for a Moment photo; a gray box until the authorized fetch lands. */
export function MediaImg({ src, ...rest }) {
  const url = useMedia(src)
  return url ? <img src={url} {...rest} /> : <span className={`media-wait ${rest.className ?? ''}`} role="img" aria-label={rest.alt || undefined} />
}
