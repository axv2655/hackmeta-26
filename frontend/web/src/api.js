import { useEffect, useRef, useState } from 'react'

// Backend client, the web twin of frontend/mobile/lib/backend.ts + endpoints.ts.
// Same origin: Vite proxies /api and /media in dev; the backend serves this app in production.
// Auth is mocked like on mobile: log in once, then send the user id as X-User-Id.

const KEY = 'moves-web-session'
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } }
let session = read() // { user: UserLite, username } | null
const listeners = new Set()

export const getSession = () => session
export function setSession(next) {
  session = next
  try { if (next) localStorage.setItem(KEY, JSON.stringify(next)); else localStorage.removeItem(KEY) } catch { /* private window: session lasts this tab */ }
  listeners.forEach((fn) => fn(next))
}
export function useSession() {
  const [s, set] = useState(session)
  useEffect(() => { listeners.add(set); return () => listeners.delete(set) }, [])
  return s
}

export class ApiError extends Error {
  constructor(status, detail) { super(detail); this.status = status }
}

export async function api(path, { body, method = body ? 'POST' : 'GET' } = {}) {
  const headers = { 'X-UTC-Offset': String(-new Date().getTimezoneOffset()) }
  if (session) headers['X-User-Id'] = session.user.id
  const form = body instanceof FormData
  if (body && !form) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body: body && !form ? JSON.stringify(body) : body })
  } catch {
    throw new ApiError(0, "Can't reach Moves right now")
  }
  if (res.status === 401 && session) setSession(null)
  if (!res.ok) {
    const detail = await res.json().then((b) => b?.detail, () => null)
    throw new ApiError(res.status, typeof detail === 'string' ? detail : detail?.[0]?.msg ?? `${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

export const errorText = (e) => (e?.status >= 500 ? 'Something went wrong on our side. Try again.' : e?.message || 'Something went wrong')

const e = encodeURIComponent
// The seeded world is around Meta's Menlo Park campus (mobile CAMPUS_CENTER). The web never reads
// the viewer's GPS: every "near" query is this fixed point, so no user coordinates leave the page.
export const CAMPUS = [37.48, -122.154]
const near = `lat=${CAMPUS[0]}&lng=${CAMPUS[1]}&radius_km=25`

export const endpoints = {
  login: (username, password) => api('/auth/login', { body: { username, password } }),
  users: () => api('/auth/users'),
  me: () => api('/me'),
  moves: {
    nearby: () => api(`/moves/nearby?${near}`),
    feed: () => api('/moves/feed'),
    create: (body) => api('/moves', { body }),
    join: (id) => api(`/moves/${e(id)}/join`, { method: 'POST' }),
    leave: (id) => api(`/moves/${e(id)}/leave`, { method: 'POST' }),
    end: (id) => api(`/moves/${e(id)}/end`, { method: 'POST' }),
  },
  marks: { nearby: (limit = 40) => api(`/marks/nearby?${near}&limit=${limit}`) },
  moments: {
    list: (moveId) => api(`/moves/${e(moveId)}/moments`),
    upload: (moveId, blob) => {
      const form = new FormData()
      form.append('file', blob, 'snapshot.jpg')
      return api(`/moves/${e(moveId)}/moments`, { body: form })
    },
  },
  circles: () => api('/circles'),
  audience: (circleIds, userIds) => api('/audience/preview', { body: { circle_ids: circleIds, user_ids: userIds } }),
  notifications: {
    list: () => api('/notifications'),
    read: (ids) => api('/notifications/read', { body: ids ? { ids } : {} }),
  },
  friends: {
    list: () => api('/friends'),
    requests: () => api('/friends/requests'),
    suggestions: () => api('/friends/suggestions?limit=12'),
    request: (id) => api('/friends/requests', { body: { user_id: id } }),
    accept: (id) => api(`/friends/requests/${e(id)}/accept`, { method: 'POST' }),
    drop: (id) => api(`/friends/requests/${e(id)}`, { method: 'DELETE' }),
  },
  memories: () => api('/me/memories?limit=30'),
}

// One WebSocket per signed-in user, server push only (mobile lib/realtime.ts). Every envelope goes out on
// `events` under its type ('move.updated', 'notification', ...), plus 'socket.open' on each (re)connect.
export const events = new EventTarget()
const emit = (type, data) => events.dispatchEvent(new CustomEvent(type, { detail: data }))

export function useRealtime() {
  const userId = useSession()?.user.id
  useEffect(() => {
    if (!userId) return undefined
    let ws, retry, closed = false, attempt = 0
    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/ws?user_id=${e(userId)}`)
      ws.onopen = () => { attempt = 0; emit('socket.open') }
      ws.onmessage = (m) => { try { const env = JSON.parse(m.data); if (typeof env?.type === 'string') emit(env.type, env.data) } catch { /* not an envelope */ } }
      ws.onclose = () => { if (!closed) retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++)) }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { closed = true; clearTimeout(retry); ws?.close() }
  }, [userId])
}

// Envelope types (ARCHITECTURE.md 9.1) that change what the Moves map shows.
export const MOVE_EVENTS = ['move.created', 'move.updated', 'move.ended', 'participant.changed', 'moment.added']

/** Run `fn(type, data)` on each of these server event types, and on every socket (re)connect. */
export function useEvents(types, fn) {
  const ref = useRef(fn)
  ref.current = fn
  const key = types.join(',')
  useEffect(() => {
    const all = ['socket.open', ...key.split(',')]
    const on = (ev) => ref.current(ev.type, ev.detail)
    all.forEach((t) => events.addEventListener(t, on))
    return () => all.forEach((t) => events.removeEventListener(t, on))
  }, [key])
}

/** Load once (and again when `deps` change). Returns { data, error, loading, reload, set }. */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    fn().then((data) => live && setState({ data, error: null, loading: false }), (err) => live && setState((s) => ({ ...s, error: errorText(err), loading: false })))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps])
  return { ...state, reload: () => setTick((t) => t + 1), set: (fn2) => setState((s) => ({ ...s, data: fn2(s.data) })) }
}

const MIN = 60_000
/** "now", "12 m", "3 h", "2 d" since an ISO time. */
export function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / MIN))
  return m < 1 ? 'now' : m < 60 ? `${m} m` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`
}

/**
 * A Moment photo under /media is checked per viewer (only people who can see the Move get it), so it needs
 * X-User-Id, which an <img src> cannot send. Fetch it with the header and hand back a blob: URL.
 * Anything else (data:, blob:, public /fb/ paths) passes straight through. null while loading or on failure.
 */
export function useMedia(src) {
  const needsAuth = typeof src === 'string' && src.startsWith('/media/') && !src.startsWith('/media/seed/')
  const [url, setUrl] = useState(needsAuth ? null : src)
  useEffect(() => {
    if (!needsAuth) { setUrl(src); return undefined }
    let gone = false
    let made = null
    setUrl(null)
    fetch(src, { headers: session ? { 'X-User-Id': session.user.id } : {} })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => { if (!gone) { made = URL.createObjectURL(b); setUrl(made) } })
      .catch(() => { /* stays null: the caller shows its placeholder */ })
    return () => { gone = true; if (made) URL.revokeObjectURL(made) }
  }, [src, needsAuth])
  return url
}
