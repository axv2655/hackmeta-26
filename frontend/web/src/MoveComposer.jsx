import { useEffect, useMemo, useState } from 'react'
import * as L from 'lucide-react'
import { endpoints, errorText, useLoad } from './api'
import { cat } from './categories'
import { Face } from './people'

// The bottom dock of the Moves map: "What are you up to?", then a sheet to pick the place and who sees it.
// Rule 4 (ARCHITECTURE.md 1.5): the audience line, counted by the server, shows before Share.

const toggleIn = (xs, v) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v])

function audienceLine(summary, picked) {
  if (!picked) return 'Pick at least one Circle or friend'
  if (!summary) return 'Counting who will see it...'
  const names = [...summary.circles.map((c) => c.name), ...summary.people.map((u) => u.first_name)]
  return `Visible to ${summary.count} ${summary.count === 1 ? 'person' : 'people'}: ${names.join(', ')}`
}

function ShareSheet({ draft, seed, onCancel, onPosted }) {
  const places = useLoad(() => endpoints.marks.nearby(12))
  const circles = useLoad(endpoints.circles)
  const friends = useLoad(endpoints.friends.list)
  const [place, setPlace] = useState(null)
  const [circleIds, setCircleIds] = useState([])
  const [pickedIds, setUserIds] = useState(seed?.userIds ?? [])
  // "Do It Again" seeds people from a past Move: only the ones who are still your friends go out
  const userIds = useMemo(() => (friends.data ? pickedIds.filter((id) => friends.data.some((f) => f.user.id === id)) : pickedIds), [pickedIds, friends.data])
  const [summary, setSummary] = useState(null)
  const [state, setState] = useState({ busy: false, error: null })
  const picked = circleIds.length + userIds.length > 0
  useEffect(() => {
    setSummary(null)
    if (!picked) return undefined
    let live = true
    endpoints.audience(circleIds, userIds).then((s) => live && setSummary(s), () => live && setSummary(null))
    return () => { live = false }
  }, [circleIds, userIds, picked])
  // "Do It Again" keeps the same place while it is still in the nearby list
  const mark = place ?? places.data?.find((m) => m.id === seed?.markId) ?? places.data?.[0]
  const line = audienceLine(summary, picked)
  const share = async () => {
    setState({ busy: true, error: null })
    try {
      // notify_user_ids null: the Muse notify pipeline picks who gets a ping, among this audience only
      const move = await endpoints.moves.create({ mark_id: mark.id, text: draft, category: mark.category, circle_ids: circleIds, user_ids: userIds, kind: 'move', open: false, fill_minutes: null, origin: 'manual', origin_ref: null, creator_there: true, notify_user_ids: null })
      onPosted(move, line)
    } catch (e) { setState({ busy: false, error: errorText(e) }) }
  }
  return (
    <section className="mv-glass mv-acts mv-sheet" aria-label="Choose where and who sees your Move">
      <div className="row between"><h3>Share your Move</h3><button type="button" className="icon-btn mv-close-inline" aria-label="Cancel" onClick={onCancel}><L.X size={18} /></button></div>
      <div className="row mv-preview"><span className="grow"><b className="block clip">{draft}</b><span className="muted row"><L.MapPin size={14} /> {mark ? `At ${mark.name}` : 'Pick a place'}</span></span></div>
      <h4>Where</h4>
      {places.error && <p className="muted small">{places.error} <button type="button" className="blue" onClick={places.reload}>Retry</button></p>}
      <div className="mv-picks">
        {places.loading && !places.data && <span className="muted small">Loading places...</span>}
        {places.data?.map((m) => {
          const Icon = cat(m.category)[3]
          return <button key={m.id} type="button" className="mv-pick" aria-pressed={mark?.id === m.id} onClick={() => setPlace(m)}><Icon size={15} /> {m.name}</button>
        })}
      </div>
      <h4>Circles</h4>
      <div className="mv-picks">
        {circles.data?.length === 0 && <span className="muted small">No Circles yet. Make one in the app, or pick friends below.</span>}
        {circles.data?.map((c) => (
          <button key={c.id} type="button" className="mv-pick" aria-pressed={circleIds.includes(c.id)} onClick={() => setCircleIds((xs) => toggleIn(xs, c.id))}>{c.emoji || <L.Users size={15} />} {c.name} <span className="mv-count">{c.members.length}</span></button>
        ))}
      </div>
      <h4>Friends</h4>
      <div className="mv-picks">
        {friends.data?.length === 0 && <span className="muted small">No friends yet.</span>}
        {friends.data?.map(({ user: u }) => (
          <button key={u.id} type="button" className="mv-pick mv-person" aria-pressed={userIds.includes(u.id)} onClick={() => setUserIds((xs) => toggleIn(xs, u.id))}><Face id={u.id} size={24} /> {u.first_name}</button>
        ))}
      </div>
      <p className={`mv-audience row${picked ? '' : ' warn'}`} aria-live="polite">{picked ? <L.Eye size={16} /> : <L.EyeOff size={16} />} {line}</p>
      {state.error && <p className="login-error" role="alert">{state.error}</p>}
      <button type="button" className="btn-primary mv-send" disabled={!picked || !summary || !mark || state.busy} onClick={share}>{state.busy ? 'Sharing...' : 'Share Move'}</button>
    </section>
  )
}

export default function MoveComposer({ out, onPick, onPosted, toast, seed }) {
  // a new `seed` remounts this (see `key` in Moves.jsx), so it only sets the starting state
  const [draft, setDraft] = useState(seed?.text ?? '')
  const [sheet, setSheet] = useState(Boolean(seed?.text?.trim()))
  const [actsOpen, setActsOpen] = useState(false)
  return (
    <form className="mv-dock" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setSheet(true); setActsOpen(false) } }} onKeyDown={(e) => e.key === 'Escape' && setSheet(false)}>
      <p className={`mv-glass mv-shared${toast ? '' : ' hide'}`} role="status">{toast && <><L.CheckCircle2 size={16} /> {toast}</>}</p>
      {sheet && <ShareSheet draft={draft.trim()} seed={seed} onCancel={() => setSheet(false)} onPosted={(move, line) => { setSheet(false); setDraft(''); onPosted(move, line) }} />}
      {actsOpen && (
        <section id="mv-acts" className="mv-glass mv-acts" aria-label="What friends are up to">
          <h3>What friends are up to</h3>
          {out.length === 0 && <p className="muted">Nobody is out right now.</p>}
          <div className="mv-acts-grid">
            {out.map((p) => {
              const [label, , color, Icon] = cat(p.category)
              return (
                <button key={p.id} type="button" className="mv-act" onClick={() => { onPick(p.id); setActsOpen(false) }}>
                  <span className="mv-act-icon" style={{ '--c': color }}><Icon size={22} /></span>
                  <span className="grow">
                    <b className="block clip">{label} at {p.mark.name}</b>
                    <span className="row muted"><Face id={p.user.id} size={22} /><span className="clip">{p.user.first_name}{p.joined.length > 0 && ` +${p.joined.length}`} · {p.time}</span></span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}
      <button type="button" className="mv-glass mv-toggle" aria-expanded={actsOpen} aria-controls="mv-acts" aria-label={actsOpen ? 'Hide what friends are up to' : 'Show what friends are up to'} onClick={() => { setActsOpen((o) => !o); setSheet(false) }}>
        {actsOpen ? <L.ChevronDown size={20} /> : <L.ChevronUp size={20} />}
      </button>
      <div className="mv-share">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What are you up to? Press Enter" aria-label="Share a Move, press Enter to choose where and who sees it" maxLength={120} enterKeyHint="next" />
      </div>
    </form>
  )
}
