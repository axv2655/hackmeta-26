import { useState } from 'react'
import { createPortal } from 'react-dom'
import * as L from 'lucide-react'
import { ago, endpoints, errorText, useEvents, useLoad, useSession } from './api'
import { Avatar, Face } from './people'
import { MediaImg, StoryViewer } from './Snapshot'

// ---- Memories: every Move you showed up to, from the moment you left (or it ended), shown like a
// Facebook memory post. Its Moments fill in live as friends add them (moment.added).

const DAY = 86_400_000
const GRID_MAX = 4

function dayLabel(iso) {
  const startOf = (t) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((startOf(Date.now()) - startOf(Date.parse(iso))) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
const withLine = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`)

// Facebook's photo grid: 1 full, 2 side by side, 3 = one big + two, 4+ = 2x2 with "+N" on the last
function PhotoGrid({ photos, onOpen }) {
  const shown = photos.slice(0, GRID_MAX)
  const extra = photos.length - shown.length
  return (
    <div className={`mem-photos n${shown.length}`}>
      {shown.map((ph, i) => (
        <button key={ph.id} className="mem-photo" onClick={() => onOpen(i)} aria-label={`Open photo by ${ph.author.first_name}`}>
          <MediaImg src={ph.media_url} alt="" />
          {i === shown.length - 1 && extra > 0 && <span className="mem-more">+{extra}</span>}
        </button>
      ))}
    </div>
  )
}

function MemoryPost({ m }) {
  const me = useSession().user
  const photos = useLoad(() => endpoints.moments.list(m.move_id), [m.move_id])
  useEvents(['moment.added'], (type, data) => { if (type === 'socket.open' || data?.move_id === m.move_id) photos.reload() })
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)
  const add = async (files) => {
    setError(null)
    try { for (const f of files) await endpoints.moments.upload(m.move_id, f) } catch (e) { setError(errorText(e)) }
    photos.reload()
  }
  const list = photos.data ?? []
  const names = m.people.map((u) => u.first_name)
  return (
    <article className="card mem-post">
      <div className="mem-day">
        <i className="sprite" style={{ backgroundImage: 'url(/fb/sidebar.webp)', backgroundPosition: '0 -1221px' }} />
        <b>{dayLabel(m.at)}</b>
        <span className="muted row mem-only"><L.Lock size={12} /> Only you</span>
      </div>
      <div className="row post-head">
        <Avatar user={me} />
        <div className="grow">
          <div><b>{me.name}</b> was at <b>{m.mark_name}</b>{names.length > 0 && <> with <b>{withLine(names)}</b></>}</div>
          <div className="muted">{ago(m.at)} ago · <L.Lock size={11} /></div>
        </div>
      </div>
      {m.text && <p className="post-text">{m.text}</p>}
      {m.people.length > 0 && <div className="mv-faces mem-faces">{m.people.slice(0, 5).map((u) => <Face key={u.id} id={u.id} size={28} />)}</div>}
      {error && <p className="login-error">{error}</p>}
      {photos.error && <p className="muted small">{photos.error}</p>}
      {list.length > 0 && <PhotoGrid photos={list} onOpen={setOpen} />}
      <div className="mem-actions">
        <label className="mem-action"><L.ImagePlus size={20} /> Add photos<input className="sr-only" type="file" accept="image/*" multiple onChange={(e) => { add([...e.target.files]); e.target.value = '' }} /></label>
        <span className="mem-action muted"><L.Images size={20} /> {list.length ? `${list.length} Moment${list.length === 1 ? '' : 's'}` : 'No Moments yet'}</span>
      </div>
      {open !== null && createPortal(<StoryViewer snaps={list.map((ph) => [ph.media_url, ph.author.first_name])} start={open} onClose={() => setOpen(null)} />, document.body)}
    </article>
  )
}

/** The Memories feed (the page shell and side nav stay in App.jsx). */
export default function MemoriesFeed() {
  const memories = useLoad(endpoints.memories)
  // a visit becomes a Memory the moment you leave or the Move ends
  useEvents(['move.ended', 'participant.changed'], memories.reload)
  return (
    <main className="page-main narrow">
      <img className="mem-banner" src="/fb/memories-header.png" alt="" />
      <h2>Memories from your outings</h2>
      <p className="muted mem-sub">Every Move you showed up to lands here as soon as you leave, with its Moments. Only you see this collection; friends still see your Ghost on the map for a day.</p>
      {memories.loading && !memories.data && <p className="muted">Loading...</p>}
      {memories.error && <p className="muted">{memories.error} <button className="blue" onClick={memories.reload}>Retry</button></p>}
      {memories.data?.length === 0 && <p className="muted">No memories yet. Pull up to a Move. When you leave, or it ends, it shows up here.</p>}
      {memories.data?.map((m) => <MemoryPost key={m.move_id} m={m} />)}
    </main>
  )
}
