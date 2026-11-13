import { useState } from 'react'
import * as L from 'lucide-react'
import { ago, endpoints, errorText, useEvents, useLoad, useSession } from './api'
import { cat } from './categories'
import { Avatar, Face } from './people'
import { MoveRecap, withLine } from './Recap'

// ---- Memories: every Move you showed up to, from the moment you left (or it ended), shown like a
// Facebook memory post. Its Moments fill in live as friends add them (moment.added).

const DAY = 86_400_000

function dayLabel(iso) {
  const startOf = (t) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((startOf(Date.now()) - startOf(Date.parse(iso))) / DAY)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function MemoryPost({ m, onDoAgain }) {
  const me = useSession().user
  const photos = useLoad(() => endpoints.moments.list(m.move_id), [m.move_id])
  useEvents(['moment.added'], (type, data) => { if (type === 'socket.open' || data?.move_id === m.move_id) photos.reload() })
  const [error, setError] = useState(null)
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
      <MoveRecap
        photos={list}
        sub={`${cat(m.category)[0]} · ${dayLabel(m.at)}`}
        caption={list.find((ph) => ph.caption)?.caption ?? (names.length ? `${cat(m.category)[0]} with ${withLine(names)}.` : null)}
        again={onDoAgain && { sub: names.length ? 'Same group, new Move?' : 'Same plan, new Move?', onClick: () => onDoAgain({ text: m.text, markId: m.mark_id, userIds: m.people.map((u) => u.id), at: Date.now() }) }}
        onFiles={add}
        error={error ?? photos.error}
        empty="No Moments yet. Add the photos from this one."
      />
    </article>
  )
}

/** The Memories feed (the page shell and side nav stay in App.jsx). */
export default function MemoriesFeed({ onDoAgain }) {
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
      {memories.data?.map((m) => <MemoryPost key={m.move_id} m={m} onDoAgain={onDoAgain} />)}
    </main>
  )
}
