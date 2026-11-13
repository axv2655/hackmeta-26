import { useState } from 'react'
import { endpoints, errorText, setSession, useLoad } from './api'
import { Avatar } from './people'

// Mock auth, same as mobile: seeded people log in as their first name with the password "moves".
const SEED_PASSWORD = 'moves'

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
        <h3>Demo people</h3>
        {users.loading && !users.data && <p className="muted">Loading...</p>}
        {users.error && <p className="login-error">{users.error} <button className="blue" onClick={users.reload}>Retry</button></p>}
        <div className="login-people">
          {users.data?.map((u) => (
            <button key={u.id} className="login-person" disabled={busy} onClick={() => logIn(u.first_name, SEED_PASSWORD)}>
              <Avatar user={u} size={44} /><b className="clip">{u.first_name}</b>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
