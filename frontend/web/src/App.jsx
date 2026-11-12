import { useEffect, useRef, useState } from 'react'
import * as L from 'lucide-react'

// drop-in icons: src/assets/icons/<name>.svg overrides the bundled Lucide fallback
const FILES = import.meta.glob('./assets/icons/*.svg', { eager: true, query: '?raw', import: 'default' })
const pick = (name, Fallback) => {
  const svg = FILES[`./assets/icons/${name}.svg`]
  // inline markup (local trusted files) so fill="currentColor" follows CSS color
  return svg ? ({ size = 24 }) => <span aria-hidden="true" style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: svg.replace('<svg', `<svg width="${size}" height="${size}"`) }} /> : Fallback
}
const Home = pick('home', L.Home)
const MonitorPlay = pick('video', L.MonitorPlay)
const Store = pick('marketplace', L.Store)
const Users = pick('groups', L.Users)
const Friends = pick('friends', L.Users)
const Menu = pick('menu', L.Menu)
const MessageCircle = pick('messages', L.MessageCircle)
const Bell = pick('notifications', L.Bell)
const Globe = pick('globe', L.Globe)
const Plus = pick('plus', L.Plus)

const ME = 'Alex Rivera'
const FRIENDS = ['Priya Shah', 'Marcus Lee', 'Sofia Gomez', 'Jordan Kim', 'Ava Chen', 'Noah Patel', 'Lena Novak', 'Omar Haddad']
// Facebook sidebar sprites (Meta-provided assets): [label, sheet, y-offset]
const SHORTCUTS = [['Meta AI', 'meta-ai', 0], ['Friends', 'sidebar', -851], ['Pages', 'sidebar', -333], ['Groups', 'sidebar', -185], ['Memories', 'sidebar', -1221], ['Saved', 'sidebar', -518], ['Reels', 'sidebar', -111], ['Marketplace', 'sidebar', -999]]
const ADS = [
  { title: 'Download Claude Code for desktop', domain: 'claude.com/product/claude-code', img: '/fb/ad-claude-code.jpg' },
  { title: 'Eleven v4 Turbo: the API for expressive real-time voice', domain: 'elevenlabs.io', img: '/fb/ad-elevenlabs.jpg' },
]
const INITIAL_POSTS = [
  { id: 1, author: 'Priya Shah', time: '2h', text: 'Sunrise hike this morning. Worth the 5am alarm.', image: 200, likes: 128, comments: [{ author: 'Marcus Lee', text: 'Unreal view!' }], shares: 4 },
  { id: 2, author: 'Marcus Lee', time: '5h', text: 'Shipped our hackathon project at 3am. Sleep is for the weak. 🚀', likes: 54, comments: [], shares: 1 },
  { id: 3, author: 'Sofia Gomez', time: '1d', text: 'New recipe: miso caramel brownies.', image: 20, likes: 342, comments: [{ author: 'Ava Chen', text: 'Recipe please 🙏' }, { author: 'Jordan Kim', text: 'Bring some Monday' }], shares: 12 },
]

const hue = (name) => [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360
// offline-safe placeholder art: a two-tone gradient per hue
const art = (h) => `linear-gradient(135deg, hsl(${h} 60% 55%), hsl(${(h + 60) % 360} 70% 35%))`
// same 3 placeholder photos as Cadence (Team-37-backend Avatar.tsx); picked per name, initials show if offline
const PFPS = [
  'https://cdn.21st.dev/assets/localized/f9ec2aa53d0e5399b925d1dc86f057ffd36f42755e94579862cf6ee4b68a06d1.png',
  'https://cdn.21st.dev/assets/localized/7bdeb01a33494b48dfd2e499ed79069c4d6538c0f8f0eeff3c6c323f3d29be4c.png',
  'https://cdn.21st.dev/assets/localized/11a67bb27c5e011bb9028042fa7fb6eba2bc69a09c43cec351ada077cc4b869d.png',
]
const Avatar = ({ name, size = 40 }) => (
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue(name)} 55% 50%)` }} aria-hidden="true">
    {name.split(' ').map((p) => p[0]).join('')}
    <img src={PFPS[hue(name) % PFPS.length]} alt="" onError={(e) => e.currentTarget.remove()} />
  </span>
)

// demo notifications; text is plain JSX parts so nothing is injected as HTML
const NOTIFS = [
  { id: 1, who: ME, badge: ['#0866ff', L.Shield], text: ['Someone tried to log in, but we stopped them.'], time: '1h', unread: true, isNew: true },
  { id: 2, who: ME, badge: ['#0866ff', L.Shield], text: ['You approved a login.'], time: '14h', unread: true },
  { id: 3, who: 'Priya Shah', badge: ['#0866ff', L.MessageSquare], text: [<b key="b">Priya Shah</b>, ' posted a link: "Sunrise hike photos"'], time: '1d', unread: true },
  { id: 4, who: 'Sofia Gomez', badge: ['#0866ff', L.Image], text: [<b key="b">Sofia Gomez</b>, ' added a new photo: "Miso caramel brownies".'], time: '1d', meta: '27 reactions · 11 comments', unread: true },
  { id: 5, who: 'Omar Haddad', badge: ['#65676b', L.UserPlus], text: ['You have a new friend suggestion: ', <b key="b">Omar Haddad</b>, '.'], time: '2d', unread: false },
]
const PAGES = ['Rivera Studio', 'Hackmeta Team']
const MENU = [['Settings & privacy', L.Settings, true], ['Help & support', L.CircleHelp, true], ['Report a problem', L.MessageSquareWarning, false, 'CTRL B'], ['Display & accessibility', L.Moon, true], ['Log out', L.LogOut, false]]

function ProfileMenu() {
  return (
    <div className="dropdown" role="menu">
      <div className="profiles">
        <a className="menu-row"><Avatar name={ME} size={36} /><b>{ME}</b></a>
        <div className="divider" />
        {PAGES.map((pg) => <a key={pg} className="menu-row"><span className="switch-ring"><Avatar name={pg} size={28} /></span><b>{pg}</b></a>)}
        <div className="divider" />
        <button className="btn-gray wide"><L.CircleUserRound size={18} /> See all profiles</button>
      </div>
      {MENU.map(([label, I, more, sub]) => (
        <a key={label} className="menu-row" role="menuitem">
          <span className="menu-icon"><I size={20} /></span>
          <span className="grow">{label}{sub && <span className="muted sub">{sub}</span>}</span>
          {more && <L.ChevronRight size={24} className="muted" />}
        </a>
      ))}
      <p className="menu-footer">Privacy · Consumer Health Privacy · Terms · Advertising · Ad Choices · Cookies · More</p>
    </div>
  )
}

function NotifRow({ n, onRead }) {
  const B = n.badge[1]
  return (
    <a className="notif" onClick={() => onRead(n.id)}>
      <span className="notif-pic"><Avatar name={n.who} size={56} /><span className="notif-badge" style={{ background: n.badge[0] }}><B size={14} color="#fff" /></span></span>
      <span className="grow">
        {n.text}
        <span className={`notif-time ${n.unread ? 'blue' : 'muted'}`}>{n.time}{n.meta && ` · ${n.meta}`}</span>
      </span>
      {n.unread && <span className="dot" aria-label="Unread" />}
    </a>
  )
}

function NotifPanel({ notifs, setNotifs }) {
  const [tab, setTab] = useState('All')
  const [push, setPush] = useState(true)
  const shown = tab === 'All' ? notifs : notifs.filter((n) => n.unread)
  const read = (id) => setNotifs((ns) => ns.map((n) => (n.id === id ? { ...n, unread: false } : n)))
  return (
    <div className="dropdown notifs" role="dialog" aria-label="Notifications">
      <div className="row between"><h2>Notifications</h2><button className="icon-btn" aria-label="Options"><L.Ellipsis size={20} /></button></div>
      <div className="row">{['All', 'Unread'].map((t) => <button key={t} className={`pill ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {push && (
        <div className="push">
          <button className="icon-btn push-x" aria-label="Dismiss" onClick={() => setPush(false)}><L.X size={20} /></button>
          <b>Your push notifications are off</b>
          <span className="muted">Turn on notifications to stay connected</span>
          <div className="row"><button className="btn-blue" onClick={() => setPush(false)}>Turn on</button><button className="btn-gray" onClick={() => setPush(false)}>Not now</button></div>
        </div>
      )}
      <div className="row between"><h3>New</h3><a className="blue">See all</a></div>
      {shown.filter((n) => n.isNew).map((n) => <NotifRow key={n.id} n={n} onRead={read} />)}
      <h3>Earlier</h3>
      {shown.filter((n) => !n.isNew).map((n) => <NotifRow key={n.id} n={n} onRead={read} />)}
    </div>
  )
}

function TopNav() {
  const [open, setOpen] = useState(null)
  const [notifs, setNotifs] = useState(NOTIFS)
  const ref = useRef(null)
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const unread = notifs.filter((n) => n.unread).length
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (e.key === 'Escape' || (e.type === 'mousedown' && !ref.current.contains(e.target))) setOpen(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return (
    <header className="topnav">
      <div className="topnav-left">
        <img className="logo" src="/logo.svg" alt="Home" />
        <input className="search" placeholder="Search" aria-label="Search" />
      </div>
      <nav className="topnav-center" aria-label="Primary">
        {[['Home', Home], ['Friends', Friends], ['Video', MonitorPlay], ['Marketplace', Store], ['Groups', Users]].map(([t, I], i) => (
          <button key={t} className={`tab ${i === 0 ? 'active' : ''}`} aria-label={t} title={t}><I size={24} /></button>
        ))}
      </nav>
      <div className="topnav-right" ref={ref}>
        <button className="circle-btn" aria-label="Menu" title="Menu"><Menu size={20} /></button>
        <button className="circle-btn" aria-label="Messenger" title="Messenger"><MessageCircle size={20} /></button>
        <button className={`circle-btn ${open === 'notifs' ? 'on' : ''}`} aria-label="Notifications" aria-expanded={open === 'notifs'} onClick={() => toggle('notifs')}>
          <Bell size={20} />{unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button className="me-btn" aria-label="Your profile" aria-expanded={open === 'profile'} onClick={() => toggle('profile')}>
          <Avatar name={ME} size={40} /><span className="me-chev"><L.ChevronDown size={12} strokeWidth={3} /></span>
        </button>
        {open === 'profile' && <ProfileMenu />}
        {open === 'notifs' && <NotifPanel notifs={notifs} setNotifs={setNotifs} />}
      </div>
    </header>
  )
}

function LeftRail() {
  return (
    <aside className="left-rail">
      <a className="rail-item"><Avatar name={ME} size={36} /> {ME}</a>
      {SHORTCUTS.map(([s, sheet, y]) => <a key={s} className="rail-item"><i className="sprite" style={{ backgroundImage: `url(/fb/${sheet}.webp)`, backgroundPosition: `0 ${y}px` }} />{s}</a>)}
      <a className="rail-item"><span className="rail-icon see-more"><L.ChevronDown size={20} /></span>See more</a>
      <footer className="rail-footer">Hackathon demo, not affiliated with Meta. Third-party icons © their respective owners, used with permission.</footer>
    </aside>
  )
}

function RightRail() {
  return (
    <aside className="right-rail">
      <h3>Contacts</h3>
      {FRIENDS.map((f) => (
        <a key={f} className="rail-item"><span className="online"><Avatar name={f} size={36} /></span>{f}</a>
      ))}
      <div className="divider" />
      <h3>Sponsored</h3>
      {ADS.map((ad) => (
        <a key={ad.title} className="ad">
          <img className="ad-img" src={ad.img} alt="" />
          <span><span className="ad-title">{ad.title}</span><span className="muted">{ad.domain}</span></span>
        </a>
      ))}
    </aside>
  )
}

function Stories() {
  return (
    <div className="stories">
      <div className="story create"><div className="story-img" /><span className="story-plus"><Plus size={22} /></span><span>Create story</span></div>
      {FRIENDS.slice(0, 4).map((f) => (
        <div key={f} className="story" style={{ backgroundImage: art(hue(f)) }}>
          <span className="story-ring"><Avatar name={f} size={36} /></span>
          <span className="story-name">{f}</span>
        </div>
      ))}
    </div>
  )
}

function Composer({ onPost }) {
  const [text, setText] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onPost(text.trim())
    setText('')
  }
  return (
    <form className="card composer" onSubmit={submit}>
      <div className="row">
        <Avatar name={ME} />
        <input className="pill-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`What's on your mind, ${ME.split(' ')[0]}?`} aria-label="Create post" />
        <button type="button" className="icon-btn" aria-label="Live video" title="Live video"><img src="/fb/live.webp" width="24" height="24" alt="" /></button>
        <button type="button" className="icon-btn" aria-label="Photo/video" title="Photo/video"><img src="/fb/photo.webp" width="24" height="24" alt="" /></button>
        <button type="button" className="icon-btn" aria-label="Feeling/activity" title="Feeling/activity"><img src="/fb/feeling.webp" width="24" height="24" alt="" /></button>
      </div>
    </form>
  )
}

function Post({ post, onLike, onComment }) {
  const [draft, setDraft] = useState('')
  return (
    <article className="card post">
      <div className="row post-head">
        <Avatar name={post.author} />
        <div><strong>{post.author}</strong><div className="muted">{post.time} · <Globe size={12} /></div></div>
      </div>
      <p className="post-text">{post.text}</p>
      {post.image != null && <div className="post-img" style={{ backgroundImage: art(post.image) }} role="img" aria-label="Post photo" />}
      <div className="divider" />
      <div className="react-bar">
        <button className={post.liked ? 'liked' : ''} onClick={onLike} aria-pressed={!!post.liked} aria-label="Like"><i className={`ui ${post.liked ? 'like-on' : 'like'}`} />{post.likes + (post.liked ? 1 : 0)}</button>
        <button onClick={() => document.getElementById(`c${post.id}`).focus()} aria-label="Comment"><i className="ui comment" />{post.comments.length}</button>
        <span className="react-stack grow-left" aria-label="Reactions"><img src="/fb/like.svg" alt="" /><img src="/fb/love.svg" alt="" /></span>
      </div>
      {post.comments.map((c, i) => (
        <div key={i} className="row comment"><Avatar name={c.author} size={32} /><div className="bubble"><strong>{c.author}</strong><div>{c.text}</div></div></div>
      ))}
      <form className="row comment" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { onComment(draft.trim()); setDraft('') } }}>
        <Avatar name={ME} size={32} />
        <input id={`c${post.id}`} className="pill-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a comment..." aria-label="Write a comment" />
      </form>
    </article>
  )
}

export default function App() {
  const [posts, setPosts] = useState(INITIAL_POSTS)
  const update = (id, fn) => setPosts((ps) => ps.map((p) => (p.id === id ? fn(p) : p)))
  return (
    <>
      <TopNav />
      <div className="layout">
        <LeftRail />
        <main className="feed">
          <Stories />
          <Composer onPost={(text) => setPosts((ps) => [{ id: Date.now(), author: ME, time: 'Just now', text, likes: 0, comments: [], shares: 0 }, ...ps])} />
          {posts.map((p) => (
            <Post key={p.id} post={p}
              onLike={() => update(p.id, (x) => ({ ...x, liked: !x.liked }))}
              onComment={(text) => update(p.id, (x) => ({ ...x, comments: [...x.comments, { author: ME, text }] }))} />
          ))}
        </main>
        <RightRail />
      </div>
    </>
  )
}
