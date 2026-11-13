import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as L from 'lucide-react'
import Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ago, CAMPUS, endpoints, errorText, MOVE_EVENTS, useEvents, useLoad, useSession } from './api'
import { bit, Face, poseFor } from './people'
import { SnapStrip, SnapshotCamera } from './Snapshot'
import MoveComposer from './MoveComposer'
import { cat } from './categories'

// ---- Moves on live data: the web twin of the mobile Moves tab (frontend/mobile/lib/live.ts).
// Privacy rule (ARCHITECTURE.md 1.5.2): everyone, me included, is pinned at the Mark of their Move,
// never at a GPS position. The page never asks for the viewer's location.

const PANEL_W = 412
const area = (address) => address?.split(',').pop()?.trim() || 'Nearby'

function fromMove(m, me) {
  const active = m.participants.filter((p) => p.status !== 'left')
  const creator = active.find((p) => p.user.id === m.creator.id)
  return {
    id: m.id, moveId: m.id, user: m.creator, title: m.text, mark: m.mark, category: m.category,
    status: creator?.status === 'going' ? 'omw' : 'there', time: ago(m.starts_at),
    joined: active.filter((p) => p.user.id !== m.creator.id).map((p) => p.user),
    mine: m.creator.id === me, myStatus: m.my_status, audience: m.audience, reason: m.muse_reason,
  }
}

// one ghost pin per finished Move at a Mark: the first person, the rest joined
function fromGhosts(mark) {
  const byMove = new Map()
  for (const g of mark.ghosts ?? []) byMove.set(g.move_id, [...(byMove.get(g.move_id) ?? []), g])
  return [...byMove.entries()].map(([moveId, gs]) => ({
    id: `ghost-${moveId}-${mark.id}`, moveId, user: gs[0].user, title: gs[0].text || `Was at ${mark.name}`, mark,
    category: mark.category, status: 'ghost', time: ago(gs[0].at), joined: gs.slice(1).map((g) => g.user),
  }))
}

async function loadWorld(me) {
  const [nearby, feed, marks] = await Promise.all([
    endpoints.moves.nearby(), endpoints.moves.feed().catch(() => []), endpoints.marks.nearby().catch(() => []),
  ])
  const ids = new Set(nearby.map((m) => m.id))
  const own = feed.filter((m) => m.creator.id === me && m.status === 'live' && !ids.has(m.id))
  const live = [...own, ...nearby].map((m) => fromMove(m, me))
  // on-the-way Moves stay off the map until that friend is at the Mark (my own always shows)
  return [...live.filter((p) => p.status === 'there' || p.mine), ...marks.flatMap(fromGhosts)]
}

const statusText = (p) => (p.status === 'ghost' ? `Left ${p.time} ago` : p.status === 'omw' ? `On the way · ${p.time}` : `There · ${p.time}`)
const going = (p) => p.myStatus === 'going' || p.myStatus === 'there'
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

// Snap-Map-style pin: full-body Bitmoji on a ground shadow with a name label. Every value from the server is escaped.
function pinIcon(p, delay = 0) {
  const ghost = p.status === 'ghost'
  const [, emoji, color] = cat(p.category)
  const name = p.mine ? 'You' : p.user.first_name
  const detail = ghost ? `Left ${p.time} ago` : p.mark.name
  return Leaflet.divIcon({
    className: 'pin-wrap', iconSize: [0, 0],
    html: `<div class="mv-pin ${p.mine ? 'me' : p.status}" style="animation-delay:${delay}ms"><div class="mv-body"><img src="${bit(p.user.id, poseFor(p.category))}" alt=""><span class="mv-badge" style="--c:${ghost ? '#8a8d91' : color}">${ghost ? '👻' : emoji}</span></div><div class="mv-label"><b>${esc(name)}${p.joined.length ? ` <i>+${p.joined.length}</i>` : ''}</b><span>${esc(detail)}</span></div></div>`,
  })
}

// center a point in the map area left open by the floating panel; `lift` (px) aims above a pin's feet
const PIN_LIFT = 44
function focus(map, at, zoom, animate = true, lift = 0) {
  if (!map) return
  const target = lift ? map.unproject(map.project(at, zoom).subtract([0, lift]), zoom) : at
  map.fitBounds([target, target], { paddingTopLeft: [window.innerWidth > 900 ? PANEL_W : 0, 0], maxZoom: zoom, animate, duration: 0.65 })
}
const pinZ = (p, sel) => (sel ? 1000 : p.mine ? 500 : p.status === 'ghost' ? -500 : 0)
const at = (p) => [p.mark.lat, p.mark.lng]

function MovesMap({ pins, selectedId, onSelect, onClear, mapRef }) {
  const el = useRef(null)
  const markers = useRef({})
  useEffect(() => {
    const map = Leaflet.map(el.current, { zoomControl: false })
    focus(map, CAMPUS, 15, false)
    // Esri World Light Gray: keyless on any domain (Stadia and CARTO only serve localhost without a key)
    Leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' }).addTo(map)
    Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
    map.on('click', onClear)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; markers.current = {} }
  }, [onClear, mapRef])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined
    const first = Object.keys(markers.current).length === 0
    pins.forEach((p, i) => {
      markers.current[p.id] = Leaflet.marker(at(p), { icon: pinIcon(p, first ? i * 70 : 0), title: `${p.user.first_name} at ${p.mark.name}`, zIndexOffset: pinZ(p) })
        .addTo(map).on('click', () => onSelect(p.id))
    })
    const mine = markers.current
    return () => { Object.values(mine).forEach((m) => m.remove()); markers.current = {} }
  }, [pins, onSelect, mapRef])
  useEffect(() => {
    pins.forEach((p) => {
      const mk = markers.current[p.id]
      mk?.getElement()?.classList.toggle('sel', p.id === selectedId)
      mk?.setZIndexOffset(pinZ(p, p.id === selectedId))
    })
  }, [pins, selectedId])
  return <div ref={el} className="moves-map" />
}

function MoveRow({ p, onPick, onPull, busy }) {
  const ghost = p.status === 'ghost'
  return (
    <div className="mv-row">
      <button className="mv-row-main" onClick={onPick}>
        <Face id={p.user.id} ghost={ghost} />
        <span className="grow">
          <span className="block clip"><b>{p.mine ? 'You' : p.user.first_name}</b> <span className={`small ${p.status === 'there' ? 'mv-live' : 'muted'}`}>{statusText(p)}</span></span>
          <span className="block clip">{p.title}</span>
          <span className="block clip muted">{p.mark.name} · {area(p.mark.address)}{p.joined.length > 0 && ` · +${p.joined.length} ${ghost ? 'went' : 'going'}`}</span>
        </span>
      </button>
      {!ghost && !p.mine && <button className={going(p) ? 'btn-primary' : 'btn-blue mv-pull'} disabled={busy} onClick={onPull}>{going(p) ? 'Going' : 'Pull up'}</button>}
    </div>
  )
}

function MoveCard({ p, busy, onPull, onEnd, onClose, moments, onSnap }) {
  const ghost = p.status === 'ghost'
  const [label, , color, Icon] = cat(p.category)
  const me = useSession().user.id
  const names = p.joined.map((u) => (u.id === me ? 'You' : u.first_name))
  const audience = p.audience && `Visible to ${p.audience.count} ${p.audience.count === 1 ? 'person' : 'people'}${p.audience.circles.length ? `: ${p.audience.circles.map((c) => c.name).join(', ')}` : ''}`
  return (
    <div className="mv-card">
      <button className="icon-btn mv-close" aria-label="Close" onClick={onClose}><L.X size={18} /></button>
      <div className="mv-card-top">
        <img className={`mv-hero${ghost ? ' ghost' : ''}`} src={bit(p.user.id, poseFor(p.category))} alt="" />
        <div>
          <span className={`mv-chip${p.mine ? ' snap-you' : ''}`} style={ghost || p.mine ? undefined : { '--c': color }}>{p.mine ? 'You' : <><Icon size={14} /> {label}</>}</span>
          <h2>{p.mine ? 'Your Move' : p.user.name}</h2>
          <span className={`mv-status ${p.status === 'there' ? 'mv-live' : 'muted'}`}>{statusText(p)}</span>
        </div>
      </div>
      <p className="mv-title">“{p.title}”</p>
      <p className="row muted mv-place"><L.MapPin size={16} /> {p.mark.name} · {area(p.mark.address)}</p>
      {audience && <p className="row muted mv-place"><L.Eye size={16} /> {audience}</p>}
      {p.reason && !p.mine && <p className="row muted mv-place"><L.Sparkles size={16} /> {p.reason}</p>}
      {names.length > 0 && (
        <div className="row">
          <span className="mv-faces">{p.joined.map((u) => <Face key={u.id} id={u.id} size={32} ghost={ghost} />)}</span>
          <span>{names.join(', ')} {ghost ? 'went' : names.length > 1 || names[0] === 'You' ? 'are in' : 'is in'}</span>
        </div>
      )}
      {moments.error ? <p className="muted small">Snapshots didn&apos;t load. {moments.error}</p>
        : <SnapStrip snaps={(moments.data ?? []).map((m) => [m.media_url, m.author.first_name])} canSnap={!ghost && (p.mine || going(p))} onSnap={onSnap} empty={p.mine ? 'Capture the moment. Friends who can see your Move will see it here.' : 'Nobody has captured this one yet. Be the first.'} />}
      <div className="row mv-actions">
        {ghost ? null
          : p.mine ? <button className="btn-gray grow" disabled={busy} onClick={onEnd}><L.CircleStop size={18} /> End Move</button>
          : <button className={`grow ${going(p) ? 'btn-blue' : 'btn-primary'}`} disabled={busy} onClick={onPull}>{going(p) ? <><L.Check size={18} /> You&apos;re going</> : <><L.Navigation size={18} /> Pull up</>}</button>}
      </div>
    </div>
  )
}

export default function Moves() {
  const me = useSession().user.id
  const world = useLoad(() => loadWorld(me), [me])
  const [sel, setSel] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [cam, setCam] = useState(null)
  const mapRef = useRef(null)
  const pins = useMemo(() => world.data ?? [], [world.data])
  const selected = pins.find((p) => p.id === sel)
  const moments = useLoad(() => (selected ? endpoints.moments.list(selected.moveId) : Promise.resolve([])), [selected?.moveId])
  useEvents(MOVE_EVENTS, (type) => { world.reload(); if (type === 'moment.added') moments.reload() })
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t) }, [toast])

  const byId = useRef(pins)
  byId.current = pins
  const select = useCallback((id) => {
    setSel(id)
    const p = byId.current.find((x) => x.id === id)
    if (p) focus(mapRef.current, at(p), 17, true, PIN_LIFT)
  }, [])
  const clear = useCallback(() => setSel(null), [])
  const act = async (fn, done) => {
    setBusy(true)
    try { await fn(); if (done) setToast(done); world.reload() } catch (e) { setToast(errorText(e)) }
    setBusy(false)
  }
  // Pull up, or take it back. The server's answer replaces the pin, so a failure leaves it as it was.
  const togglePull = (p) => act(() => (going(p) ? endpoints.moves.leave(p.moveId) : endpoints.moves.join(p.moveId)))
  const capture = async (dataUrl) => {
    const moveId = cam
    setCam(null)
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await endpoints.moments.upload(moveId, blob)
      moments.reload()
    } catch (e) { setToast(`Snapshot not shared. ${errorText(e)}`) }
  }
  const posted = (move, line) => { setToast(`Shared. ${line}`); world.reload(); setTimeout(() => select(move.id), 400) }

  const q = query.trim().toLowerCase()
  const visible = q ? pins.filter((p) => `${p.user.name} ${p.title} ${p.mark.name}`.toLowerCase().includes(q)) : pins
  const live = visible.filter((p) => p.status !== 'ghost')
  const ghosts = visible.filter((p) => p.status === 'ghost')
  const out = pins.filter((p) => p.status !== 'ghost' && !p.mine)
  return (
    <main className="moves-main">
      <MovesMap pins={pins} selectedId={sel} onSelect={select} onClear={clear} mapRef={mapRef} />
      <aside className="mv-glass mv-panel" aria-label="Moves">
        <div className="mv-scroll">
          {selected ? <MoveCard p={selected} busy={busy} moments={moments} onClose={clear} onSnap={() => setCam(selected.moveId)}
            onPull={() => togglePull(selected)} onEnd={() => act(() => endpoints.moves.end(selected.moveId), 'Your Move ended.').then(clear)} /> : (
            <>
              <div className="row mv-head">
                <input className="pill-input" placeholder="Search friends and Moves" aria-label="Search friends and Moves" value={query} onChange={(e) => setQuery(e.target.value)} />
                <Face id={me} size={44} />
              </div>
              {world.loading && !world.data && <p className="muted center">Loading Moves...</p>}
              {world.error && <p className="muted center">{world.error} <button className="blue" onClick={world.reload}>Retry</button></p>}
              {!q && out.length > 0 && <>
                <h3>Out now</h3>
                <div className="mv-out">
                  {out.map((p) => (
                    <button key={p.id} className="mv-out-item" onClick={() => select(p.id)}>
                      <Face id={p.user.id} size={64} />
                      <b className="block clip">{p.user.first_name}</b>
                      <span className="muted block clip">{cat(p.category)[0]}</span>
                    </button>
                  ))}
                </div>
              </>}
              {live.length > 0 && <><h3>Happening now</h3><div className="mv-group">{live.map((p) => <MoveRow key={p.id} p={p} busy={busy} onPick={() => select(p.id)} onPull={() => togglePull(p)} />)}</div></>}
              {ghosts.length > 0 && <><h3>Earlier</h3><div className="mv-group">{ghosts.map((p) => <MoveRow key={p.id} p={p} onPick={() => select(p.id)} />)}</div></>}
              {world.data && visible.length === 0 && <p className="muted center">{q ? `No Moves match “${query}”.` : 'Nobody is out right now. Start a Move below.'}</p>}
            </>
          )}
        </div>
      </aside>
      <div className="mv-top">
        <div className="mv-glass mv-title-pill">
          <span><b className="block">Menlo Park</b><span className="muted row"><L.Users size={14} /> {out.length} {out.length === 1 ? 'friend' : 'friends'} out</span></span>
        </div>
        <button className="mv-glass mv-recenter" aria-label="Back to campus" onClick={() => { clear(); focus(mapRef.current, CAMPUS, 15) }}><L.Navigation size={20} fill="currentColor" /></button>
      </div>
      <MoveComposer out={out} onPick={select} onPosted={posted} toast={toast} />
      {cam && <SnapshotCamera onCapture={capture} onClose={() => setCam(null)} />}
    </main>
  )
}
