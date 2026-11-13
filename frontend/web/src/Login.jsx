import { useState } from 'react'
import * as L from 'lucide-react'
import { endpoints, errorText, setSession, useLoad } from './api'
import { Face } from './people'

// Mock auth, same as mobile: seeded people log in as their first name with the password "moves".
const SEED_PASSWORD = 'moves'
// The seeded demo cast, in demo order. Real accounts on the same server stay out of the picker.
const CAST = [
  ['u_anish', 'The main demo account'],
  ['u_tony', 'Out for matcha at Kumo'],
  ['u_maya', 'Rooftop sunsets'],
  ['u_priya', 'Walking Hacker Square'],
  ['u_dev', 'Locking in at MPK 21'],
  ['u_dhivyesh', 'Always down for boba'],
  ['u_jordan', 'Hosts open pickleball'],
]

function DemoPicker({ users, busy, onPick }) {
  const cast = CAST.map(([id, line]) => [users.find((u) => u.id === id), line]).filter(([u]) => u)
  const [i, setI] = useState(0)
  if (!cast.length) return null
  const go = (d) => setI((i + d + cast.length) % cast.length)
  const [u, line] = cast[i]
  return (
    <section className="demo-pick" aria-label="Try the demo"
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1) }}>
      <span className="demo-kicker">Try the demo as</span>
      <div className="demo-row">
        <button type="button" className="demo-arrow" aria-label="Previous person" onClick={() => go(-1)}><L.ChevronLeft size={22} /></button>
        <div className="demo-person" key={u.id} aria-live="polite">
          <span className="demo-ring"><Face id={u.id} size={88} /></span>
          <b>{u.name}</b>
          <span>{line}</span>
        </div>
        <button type="button" className="demo-arrow" aria-label="Next person" onClick={() => go(1)}><L.ChevronRight size={22} /></button>
      </div>
      <div className="demo-dots" aria-hidden="true">{cast.map(([c], k) => <span key={c.id} className={k === i ? 'on' : ''} />)}</div>
      <button type="button" className="demo-go" disabled={busy} onClick={() => onPick(u)}>
        {busy ? 'Logging in...' : <>Continue as {u.first_name} <L.ArrowRight size={18} /></>}
      </button>
    </section>
  )
}

export default function Login() {
  const users = useLoad(endpoints.users)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const logIn = async (u, p) => {
    setBusy(true)
    setError(null)
    try { setSession(await endpoints.login(u.trim().toLowerCase(), p)) } catch (e) { setError(e.status === 401 ? 'Wrong username or password' : errorText(e)) }
    setBusy(false)
  }
  return (
    <main className="login">
      <section className="login-brand">
        <img className="login-logo" src="/logo.svg" alt="Facebook" />
        <p>Moves: see what your friends are up to right now, and pull up.</p>
      </section>
      <section className="card login-card">
        <form onSubmit={(e) => { e.preventDefault(); if (username && password) logIn(username, password) }}>
          <input className="login-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" aria-label="Username" autoComplete="username" />
          <input className="login-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoComplete="current-password" />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="btn-primary login-btn" disabled={busy || !username || !password}>{busy ? 'Logging in...' : 'Log in'}</button>
        </form>
        <div className="divider" />
        {users.loading && !users.data && <p className="muted">Loading...</p>}
        {users.error && <p className="login-error">{users.error} <button className="blue" onClick={users.reload}>Retry</button></p>}
        {users.data && <DemoPicker users={users.data} busy={busy} onPick={(u) => logIn(u.first_name, SEED_PASSWORD)} />}
      </section>
    </main>
  )
}
