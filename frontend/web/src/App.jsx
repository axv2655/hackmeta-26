import { useCallback, useEffect, useRef, useState } from 'react'
import * as L from 'lucide-react'
import Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'

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
const mp = (n) => pick(`mp-${n}`, L.Circle)
const rl = (n) => pick(`rl-${n}`, L.Circle)
const [RlLike, RlComment, RlShare, RlMore] = ['like', 'comment', 'share', 'more'].map(rl)
// 20px icon cropped from a Facebook sprite sheet in public/fb
const spr = (sheet, y, x = 0) => function Sprite() { return <i className="sprite20" style={{ backgroundImage: `url(/fb/${sheet}.webp)`, backgroundPosition: `${x}px ${y}px` }} /> }
const fr = (n) => pick(`fr-${n}`, L.Circle)
const Chevron = pick('fr-chevron', L.ChevronRight)

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

// closes a popover on outside click or Esc
function useDismiss(open, setOpen) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (e.key === 'Escape' || (e.type === 'mousedown' && !ref.current?.contains(e.target))) setOpen(null) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open, setOpen])
  return ref
}

// Menu dropdown: [section, [[label, desc]]]; icon is public/fb/menu/<label-slug>.webp
const MENU_SECTIONS = [
  ['Social', [['Events', 'Organize or find events and other things to do online and nearby.'], ['Friends', 'Search for friends or people you may know.'], ['Groups', 'Connect with people who share your interests.'], ['News Feed', 'See relevant posts from people and Pages you follow.'], ['Feeds', 'See the most recent posts from your friends, groups, Pages and more.'], ['Pages', 'Discover and connect with businesses on Facebook.']]],
  ['Entertainment', [['Reels', 'A Reels destination personalized to your interests and connections.'], ['Gaming Video', 'Watch and connect with your favorite games and streamers.'], ['Play games', 'Play your favorite games.']]],
  ['Shopping', [['Orders and payments', 'A seamless, secure way to pay on the apps you already use.'], ['Marketplace', 'Buy and sell in your community.']]],
  ['Personal', [['Your Ad Activity', 'See all the ads you interacted with on Facebook.'], ['Memories', 'Browse your old photos, videos and posts on Facebook.'], ['Saved', 'Find posts, photos and videos that you saved for later.'], ['Support', 'Everything you need to identify issues and fix them faster.']]],
  ['Professional', [['Ads Manager', 'Create, manage and track the performance of your ads.']]],
  ['More from Meta', [['Meta AI', 'Ask questions, brainstorm ideas, create any image you can imagine and more.'], ['Chat with AIs', 'Create and discover AIs for fun conversations or help with specific topics.'], ['Messenger Kids', 'Let kids message with close friends and family.'], ['Meta Quest 3S', 'Meta Quest 3 is now here'], ['Dating', 'Find love through what you like.'], ['Threads', "Say more with Threads — Instagram's text-based conversation app."], ['WhatsApp', 'Message and call people privately on your computer.'], ['Instagram', 'See everyday moments from people you love.']]],
]
const cr = (n, F) => pick(`cr-${n}`, F)
const CREATE = [['Post', cr('post', L.SquarePen)], ['Story', cr('story', L.BookOpen)], ['Reel', cr('reel', L.Clapperboard)], ['Life update', cr('life-update', L.Star)], ['Note', cr('note', L.MessageSquare)], null, ['Page', cr('page', L.Flag)], ['Ad', cr('ad', L.Megaphone)], ['Group', Users], ['Event', cr('event', L.CalendarPlus)], ['Marketplace listing', cr('marketplace-listing', L.ShoppingBag)], ['Fundraiser', cr('fundraiser', L.HeartHandshake)]]

// menu / shortcut labels that open one of our pages
const NAV = { Memories: 'Memories', Friends: 'Friends', Groups: 'Groups', Marketplace: 'Marketplace', Reels: 'Video', 'News Feed': 'Home' }
const navProps = (label, go) => (NAV[label] ? { href: '#', onClick: (e) => { e.preventDefault(); go(NAV[label]) } } : {})

function AppMenu({ onNav }) {
  const [q, setQ] = useState('')
  const match = (label) => label.toLowerCase().includes(q.trim().toLowerCase())
  return (
    <div className="dropdown app-menu" role="dialog" aria-label="Menu">
      <h2>Menu</h2>
      <div className="app-menu-cols">
        <div className="menu-card">
          <label className="side-search"><L.Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu" aria-label="Search menu" /></label>
          {MENU_SECTIONS.map(([sec, items]) => {
            const shown = items.filter(([label]) => match(label))
            return shown.length > 0 && (
              <section key={sec} className="menu-sec">
                <h3>{sec}</h3>
                {shown.map(([label, desc]) => (
                  <a key={label} className="menu-row tall" {...navProps(label, onNav)}>
                    <img className="menu-img" src={`/fb/menu/${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`} alt="" />
                    <span className="grow"><b>{label}</b><span className="small">{desc}</span></span>
                  </a>
                ))}
              </section>
            )
          })}
        </div>
        <div className="menu-card create">
          <h3>Create</h3>
          {CREATE.map((c, k) => (c ? <CreateRow key={c[0]} label={c[0]} I={c[1]} /> : <div key={k} className="divider" />))}
        </div>
      </div>
    </div>
  )
}

function CreateRow({ label, I }) {
  return <a className="menu-row"><span className="menu-icon"><I size={20} /></span>{label}</a>
}

// demo Messenger chats
const CHATS = [
  { who: 'Priya Shah', last: 'Priya: sending the trail map now', time: '5m', unread: true },
  { who: 'Marcus Lee', last: 'You: see you at 7', time: '1h', unread: false },
  { who: 'Sofia Gomez', last: 'Sofia: brownies were a hit', time: '3h', unread: true },
  { who: 'Jordan Kim', last: 'Jordan sent a photo.', time: '1d', unread: false },
  { who: 'Ava Chen', last: 'You: thanks!', time: '2d', unread: false },
  { who: 'Noah Patel', last: 'Noah: are we still on for Saturday?', time: '4d', unread: false },
]

function ChatsPanel({ chats, setChats }) {
  const [tab, setTab] = useState('All')
  const [q, setQ] = useState('')
  // demo chats are all 1:1, so Groups/Communities stay empty
  const shown = tab === 'Groups' || tab === 'Communities' ? [] : chats.filter((c) => (tab !== 'Unread' || c.unread) && c.who.toLowerCase().includes(q.trim().toLowerCase()))
  const read = (who) => setChats((cs) => cs.map((c) => (c.who === who ? { ...c, unread: false } : c)))
  return (
    <div className="dropdown notifs chats" role="dialog" aria-label="Chats">
      <div className="row between"><h2>Chats</h2><span className="row"><button className="icon-btn" aria-label="Options"><L.Ellipsis size={20} /></button><button className="icon-btn" aria-label="See all in Messenger"><L.Maximize2 size={18} /></button><button className="icon-btn" aria-label="New message"><L.SquarePen size={18} /></button></span></div>
      <label className="side-search"><L.Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Messenger" aria-label="Search Messenger" /></label>
      <div className="row">{['All', 'Unread', 'Groups', 'Communities'].map((t) => <button key={t} className={`pill ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {shown.map((c) => (
        <a key={c.who} className="notif" onClick={() => read(c.who)}>
          <Avatar name={c.who} size={56} />
          <span className="grow"><span className={c.unread ? 'b' : ''}>{c.who}</span><span className={`chat-last ${c.unread ? 'b' : 'muted'}`}>{c.last} · {c.time}</span></span>
          {c.unread && <span className="dot" aria-label="Unread" />}
        </a>
      ))}
      {shown.length === 0 && <p className="muted center">No chats</p>}
      <div className="divider" />
      <a className="blue center chat-all">See all in Messenger</a>
    </div>
  )
}

function TopNav({ view, setView }) {
  const [chats, setChats] = useState(CHATS)
  const unreadChats = chats.filter((c) => c.unread).length
  const [open, setOpen] = useState(null)
  const [notifs, setNotifs] = useState(NOTIFS)
  const ref = useDismiss(open, setOpen)
  const toggle = (k) => setOpen((o) => (o === k ? null : k))
  const unread = notifs.filter((n) => n.unread).length
  return (
    <header className="topnav">
      <div className="topnav-left">
        <button className="logo-btn" onClick={() => setView('Home')} aria-label="Home"><img className="logo" src="/logo.svg" alt="" /></button>
        <input className="search" placeholder="Search" aria-label="Search" />
      </div>
      <nav className="topnav-center" aria-label="Primary">
        {[['Home', Home], ['Friends', Friends], ['Video', MonitorPlay], ['Marketplace', Store], ['Groups', Users], ['Moves', L.Map]].map(([t, I]) => (
          <button key={t} className={`tab ${view === t ? 'active' : ''}`} aria-label={t} aria-current={view === t ? 'page' : undefined} data-tip={t === 'Video' ? 'Reels' : t} onClick={() => setView(t)}><I size={24} /></button>
        ))}
      </nav>
      <div className="topnav-right" ref={ref}>
        <button className={`circle-btn ${open === 'menu' ? 'on' : ''}`} aria-label="Menu" data-tip="Menu" aria-expanded={open === 'menu'} onClick={() => toggle('menu')}><Menu size={20} /></button>
        <button className={`circle-btn ${open === 'chats' ? 'on' : ''}`} aria-label="Messenger" data-tip="Messenger" aria-expanded={open === 'chats'} onClick={() => toggle('chats')}><MessageCircle size={20} />{unreadChats > 0 && <span className="badge">{unreadChats}</span>}</button>
        <button className={`circle-btn ${open === 'notifs' ? 'on' : ''}`} aria-label="Notifications" data-tip="Notifications" aria-expanded={open === 'notifs'} onClick={() => toggle('notifs')}>
          <Bell size={20} />{unread > 0 && <span className="badge">{unread}</span>}
        </button>
        <button className="me-btn" aria-label="Your profile" data-tip="Account" aria-expanded={open === 'profile'} onClick={() => toggle('profile')}>
          <Avatar name={ME} size={40} /><span className="me-chev"><L.ChevronDown size={12} strokeWidth={3} /></span>
        </button>
        {open === 'menu' && <AppMenu onNav={(v) => { setView(v); setOpen(null) }} />}
        {open === 'chats' && <ChatsPanel chats={chats} setChats={setChats} />}
        {open === 'profile' && <ProfileMenu />}
        {open === 'notifs' && <NotifPanel notifs={notifs} setNotifs={setNotifs} />}
      </div>
    </header>
  )
}

function LeftRail({ setView }) {
  return (
    <aside className="left-rail">
      <a className="rail-item"><Avatar name={ME} size={36} /> {ME}</a>
      {SHORTCUTS.map(([s, sheet, y]) => <a key={s} className="rail-item" {...navProps(s, setView)}><i className="sprite" style={{ backgroundImage: `url(/fb/${sheet}.webp)`, backgroundPosition: `0 ${y}px` }} />{s}</a>)}
      <a className="rail-item"><span className="rail-icon see-more"><L.ChevronDown size={20} /></span>See more</a>
      <footer className="rail-footer">Hackathon demo, not affiliated with Meta. Third-party icons © their respective owners, used with permission.</footer>
    </aside>
  )
}

const AD_MENU = [['Hide Ad', L.SquareX, 'Never see this ad again.'], ['Report ad', L.MessageSquareWarning, 'Tell us about a problem with this ad.'], ['Why am I seeing this ad?', L.Info], ['About this ad', L.FileText]]

function Ad({ ad, onHide }) {
  const [open, setOpen] = useState(null)
  const ref = useDismiss(open, setOpen)
  return (
    <div className={`ad ${open ? 'menu-open' : ''}`} ref={ref}>
      <img className="ad-img" src={ad.img} alt="" />
      <span><span className="ad-title">{ad.title}</span><span className="muted">{ad.domain}</span></span>
      <span className="ad-tools">
        <button className="ad-tool" aria-label="Ad options" aria-expanded={!!open} onClick={() => setOpen(open ? null : 'menu')}><L.Ellipsis size={20} /></button>
        <button className="ad-tool" aria-label="Hide ad" onClick={onHide}><L.X size={20} /></button>
      </span>
      {open && (
        <div className="dropdown ad-menu" role="menu">
          {AD_MENU.map(([label, I, sub]) => (
            <button key={label} className="menu-row" role="menuitem" onClick={() => { setOpen(null); if (label === 'Hide Ad') onHide() }}>
              <I size={20} /><span className="grow">{label}{sub && <span className="muted sub">{sub}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function RightRail() {
  const [ads, setAds] = useState(ADS)
  return (
    <aside className="right-rail">
      <h3>Contacts</h3>
      {FRIENDS.map((f) => (
        <a key={f} className="rail-item"><span className="online"><Avatar name={f} size={36} /></span>{f}</a>
      ))}
      <div className="divider" />
      <h3>Sponsored</h3>
      {ads.map((ad) => <Ad key={ad.title} ad={ad} onHide={() => setAds((a) => a.filter((x) => x !== ad))} />)}
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
        <button type="button" className="icon-btn" aria-label="Live video" data-tip="Live video"><img src="/fb/live.webp" width="24" height="24" alt="" /></button>
        <button type="button" className="icon-btn" aria-label="Photo/video" data-tip="Photo/video"><img src="/fb/photo.webp" width="24" height="24" alt="" /></button>
        <button type="button" className="icon-btn" aria-label="Feeling/activity" data-tip="Feeling/activity"><img src="/fb/feeling.webp" width="24" height="24" alt="" /></button>
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
        <div>{post.group && <strong className="group-name">{post.group}</strong>}<strong className={post.group ? 'muted small' : ''}>{post.author}</strong><div className="muted">{post.time} · <Globe size={12} /></div></div>
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

// ---- tab pages (demo content) ----
function SideNav({ title, items, gear = true, search, children }) {
  const [active, setActive] = useState(items[0][0])
  return (
    <aside className="side-nav">
      <div className="row between"><h1>{title}</h1>{gear && <button className="icon-btn gear" aria-label={`${title} settings`}><L.Settings size={20} /></button>}</div>
      {search && <label className="side-search"><L.Search size={16} /><input placeholder={search} aria-label={search} /></label>}
      {items.map(([label, I, more]) => (
        <button key={label} className={`side-item ${active === label ? 'on' : ''}`} onClick={() => setActive(label)}>
          <span className="side-icon"><I size={20} /></span><span className="grow">{label}</span>{more && <span className="muted"><Chevron size={20} /></span>}
        </button>
      ))}
      {children}
    </aside>
  )
}

// photos: public Marketplace listings saved for the demo; titles/cities are our own
const LISTINGS = [['$360', 'Camera sculpture, one of a kind', 'Grapevine, TX', 'camera'], ['$200', 'Steel watch collection', 'McKinney, TX', 'watches'], ['$2,500', '2012 sport motorcycle', 'Euless, TX', 'motorcycle'], ['$80', 'Fly fishing gear', 'Durant, OK', 'fishing'], ['$900', 'Baby grand piano', 'Lewisville, TX', 'piano'], ['$150', 'Leather sofa', 'Denton, TX', 'sofa'], ['$120', 'Ping pong table', 'Flower Mound, TX', 'pingpong'], ['$450', 'Laptop, like new', 'Plano, TX', 'laptop']]

const CreateListing = mp('create-new-listing')
const MARKET_CATEGORIES = [['Vehicles', mp('vehicles')], ['Property Rentals', mp('property-rentals')], ['Apparel', spr('market', -260)], ['Classifieds', mp('classifieds')], ['Electronics', mp('electronics')], ['Entertainment', mp('entertainment')], ['Family', mp('family')], ['Free Stuff', mp('free-stuff')], ['Garden & Outdoor', mp('garden-outdoor')], ['Hobbies', spr('market', -134)], ['Home Goods', mp('home-goods')], ['Home Improvement Supplies', mp('home-improvement-supplies')], ['Home Sales', mp('home-sales')], ['Musical Instruments', mp('musical-instruments')], ['Office Supplies', mp('office-supplies')], ['Pet Supplies', mp('pet-supplies')], ['Sporting Goods', mp('sporting-goods')], ['Toys & Games', spr('market', -176)]]

function Marketplace() {
  return (
    <div className="page">
      <SideNav title="Marketplace" search="Search Marketplace" items={[['Browse all', mp('browse-all')], ['Jobs', mp('jobs')], ['Notifications', spr('notif', -146)], ['Inbox', mp('inbox')], ['Marketplace status', mp('marketplace-status')], ['Buying', mp('buying'), true], ['Selling', mp('selling'), true]]}>
        <button className="btn-blue wide-btn"><CreateListing size={16} /> Create new listing</button>
        <button className="btn-gray wide-btn">Create multiple listings</button>
        <div className="divider" />
        <h3 className="side-h">Location</h3>
        <a className="blue side-link">Highland Village, Texas · Within 40 mi</a>
        <div className="divider" />
        <h3 className="side-h">Categories</h3>
        {MARKET_CATEGORIES.map(([label, I]) => <button key={label} className="side-item"><span className="side-icon"><I size={20} /></span>{label}</button>)}
      </SideNav>
      <main className="page-main">
        <div className="row between"><h2>Today&apos;s picks</h2><a className="blue row"><L.MapPin size={16} /> Lewisville · 40 mi</a></div>
        <div className="grid listings">
          {LISTINGS.map(([price, title, city, img]) => (
            <a key={title} className="listing">
              <img className="listing-img" src={`/fb/listings/${img}.jpg`} alt={title} loading="lazy" />
              <b>{price}</b><span className="clip">{title}</span><span className="muted">{city}</span>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}

const GROUPS = [['Hackathon Builders', 'Last active a day ago'], ['Dallas Startup Network', 'Last active a week ago'], ['Weekend Hikers of Texas', 'Last active 29 weeks ago']]
const GROUP_POSTS = [
  { id: 101, group: 'Hackathon Builders', author: 'Marcus Lee', time: 'Yesterday at 12:00 PM', text: 'Demo day tips: show the working product in the first 30 seconds, then explain how it works.', image: 210, likes: 64, comments: [], shares: 3 },
  { id: 102, group: 'Weekend Hikers of Texas', author: 'Priya Shah', time: '2d', text: 'Trail report: dry, shaded, and the creek crossing is easy this week.', image: 120, likes: 31, comments: [], shares: 1 },
]

function Groups() {
  const [posts, setPosts] = useState(GROUP_POSTS)
  return (
    <div className="page">
      <SideNav title="Groups" search="Search groups" items={[['Your feed', L.Newspaper], ['Discover', L.Compass], ['Your groups', L.Users]]}>
        <button className="btn-blue wide-btn"><L.Plus size={18} /> Create new group</button>
        <div className="divider" />
        <div className="row between"><h3 className="side-h">Groups you&apos;ve joined</h3><a className="blue">See all</a></div>
        {GROUPS.map(([g, when]) => (
          <a key={g} className="side-item"><span className="group-pic" style={{ backgroundImage: art(hue(g)) }} /><span className="grow"><b className="block">{g}</b><span className="muted">{when}</span></span></a>
        ))}
      </SideNav>
      <main className="page-main narrow">
        <h3 className="muted">Recent activity</h3>
        {posts.map((p) => (
          <Post key={p.id} post={p}
            onLike={() => setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, liked: !x.liked } : x)))}
            onComment={(text) => setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, comments: [...x.comments, { author: ME, text }] } : x)))} />
        ))}
      </main>
    </div>
  )
}

const REELS = [['Ava Chen', 'Camping snack haul', '615K', '1.2K', '3.5K', 30], ['Noah Patel', 'Sunset skate session', '82K', '940', '1.1K', 200], ['Lena Novak', 'One-pan pasta in 10 minutes', '240K', '3.4K', '9.8K', 330]]

function Reels() {
  const [i, setI] = useState(0)
  const [muted, setMuted] = useState(true)
  const [liked, setLiked] = useState({})
  const [who, caption, likes, comments, shares, h] = REELS[i]
  return (
    <div className="page reels">
      <aside className="side-nav dark">
        <h1>Reels</h1>
        {[['For you', rl('for-you')], ['Following', rl('following')], ['Profile', rl('profile')]].map(([label, I], k) => (
          <button key={label} className={`side-item ${k === 0 ? 'on' : ''}`}><I size={22} /> {label}</button>
        ))}
      </aside>
      <main className="reel-stage">
        <div className="reel" style={{ backgroundImage: art(h) }}>
          <button className="reel-mute" aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}>{muted ? <L.VolumeX size={20} /> : <L.Volume2 size={20} />}</button>
          <div className="reel-meta">
            <div className="row"><Avatar name={who} size={36} /><b>{who}</b> · <a>Follow</a></div>
            <div className="row small"><L.Music size={12} /> {who} · Original audio</div>
            <div className="small">{caption}</div>
          </div>
        </div>
        <div className="reel-actions">
          <button className={liked[i] ? 'liked' : ''} onClick={() => setLiked({ ...liked, [i]: !liked[i] })} aria-pressed={!!liked[i]}><RlLike size={24} />{likes}</button>
          <button><RlComment size={24} />{comments}</button>
          <button><RlShare size={24} />{shares}</button>
          <button aria-label="More"><RlMore size={24} /></button>
        </div>
        <div className="reel-nav">
          <button aria-label="Previous reel" onClick={() => setI((i + REELS.length - 1) % REELS.length)}><L.ChevronUp size={28} /></button>
          <button aria-label="Next reel" onClick={() => setI((i + 1) % REELS.length)}><L.ChevronDown size={28} /></button>
        </div>
      </main>
    </div>
  )
}

const REQUESTS = [['Nicole Carter', 15], ['Chloe Martin', 1], ['Daniel Reyes', 24], ['Grace Whitfield', 16], ['Ruth Lambert', 19], ['Samuel Okafor', 8], ['Maya Brooks', 3], ['Ethan Wu', 11], ['Isabel Torres', 6], ['Victor Hale', 2]]

function FriendsPage() {
  const [done, setDone] = useState({})
  return (
    <div className="page">
      <SideNav title="Friends" items={[['Home', fr('home')], ['Friend requests', fr('requests'), true], ['Suggestions', fr('suggestions'), true], ['All friends', fr('all'), true], ['Birthdays', spr('friends', -127, -158)], ['Custom lists', fr('lists'), true]]} />
      <main className="page-main">
        <div className="row between"><h2>Friend Requests</h2><a className="blue">See all</a></div>
        <div className="grid requests">
          {REQUESTS.map(([name, mutual]) => (
            <div key={name} className="request card">
              <img src={PFPS[hue(name) % PFPS.length]} alt="" />
              <div className="request-body">
                <b>{name}</b>
                <span className="muted small">{mutual} mutual friend{mutual === 1 ? '' : 's'}</span>
                {done[name] ? <span className="muted">{done[name]}</span> : <>
                  <button className="btn-primary" onClick={() => setDone({ ...done, [name]: 'Request accepted' })}>Confirm</button>
                  <button className="btn-gray" onClick={() => setDone({ ...done, [name]: 'Request removed' })}>Delete</button>
                </>}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

// ---- Moves: web port of the mobile Moves tab (frontend/mobile/components/moves, lib/mock/moves.ts).
// Privacy rule (ARCHITECTURE.md 1.5.2): a friend is pinned at the Mark of their Move, never their GPS. Only "Me" sits at my own position.
// [label, pin emoji, color, icon]; pins are HTML strings so they use the emoji, React surfaces use the icon
const CATS = { coffee: ['Coffee', '☕', '#FB724B', L.Coffee], study: ['Study', '📚', '#0866FF', L.GraduationCap], gym: ['Gym', '🏋️', '#45BD62', L.Dumbbell], party: ['Party', '🎉', '#A033FF', L.PartyPopper], music: ['Music', '🎵', '#F3425F', L.Music], food: ['Food', '🍜', '#F7B928', L.Utensils], shopping: ['Shopping', '🛍️', '#2ABBA7', L.Store] }
// placeholder Bitmoji sets a/b in public/fb/bitmoji, same assignment as mobile lib/mock/bitmoji.ts
const MV_USERS = { maya: ['Maya Patel', 'a'], tony: ['Tony Nguyen', 'b'], dev: ['Dev Mehta', 'b'], priya: ['Priya Shah', 'a'], jordan: ['Jordan Lee', 'a'], dhivyesh: ['Dhivyesh Kumar', 'b'] }
const bit = (u, pose = 'selfie') => `/fb/bitmoji/${MV_USERS[u]?.[1] ?? 'b'}/${pose}.png`
const first = (u) => MV_USERS[u][0].split(' ')[0]
// Circles: user-defined audiences (ARCHITECTURE.md 5.1). A Move is never public, it goes to Circles and people you pick.
const CIRCLES = { Roommates: ['tony', 'dev'], 'HS friends': ['maya', 'priya', 'jordan'], 'Study group': ['maya', 'dhivyesh', 'dev'] }
const MV_HOME = [32.9846, -96.7462]
const MY_POSITION = [32.98265, -96.74355]
const PANEL_W = 412
// status: there = at the Mark now, omw = pulling up, ghost = left within the last 24 h
const ALL_MOVES = [
  { id: 'mv-1', user: 'maya', title: 'Grinding the orgo PSET, come suffer with me', place: 'McDermott Library', cat: 'study', area: 'Campus', at: [32.98665, -96.74762], status: 'there', pose: 'study', time: '18 m', joined: ['priya'], dist: '0.3 mi' },
  { id: 'mv-2', user: 'tony', title: 'Leg day. Need a spotter', place: 'Activity Center', cat: 'gym', area: 'Campus', at: [32.98395, -96.75085], status: 'there', pose: 'gym', time: '6 m', joined: [], dist: '0.4 mi' },
  { id: 'mv-3', user: 'dev', title: 'Open mic at the Plinth, bring a guitar', place: 'The Plinth', cat: 'music', area: 'Campus', at: [32.98905, -96.75015], status: 'there', pose: 'music', time: '25 m', joined: ['dhivyesh', 'jordan'], dist: '0.5 mi' },
  { id: 'mv-4', user: 'priya', title: 'Matcha run, anyone?', place: 'Kumo Matcha', cat: 'coffee', area: 'Richardson', at: [32.99052, -96.73958], status: 'omw', pose: 'walk', time: '2 m', joined: [], dist: '0.6 mi' },
  { id: 'mv-5', user: 'jordan', title: 'Thrifting at CityLine', place: 'CityLine Plaza', cat: 'shopping', area: 'Richardson', at: [32.99805, -96.70315], status: 'there', pose: 'strut', time: '40 m', joined: [], dist: '2.4 mi' },
  { id: 'mv-6', user: 'dhivyesh', title: 'Rooftop hang tonight', place: 'Northside Rooftop', cat: 'party', area: 'Campus', at: [32.99042, -96.75281], status: 'ghost', pose: 'dance', time: '9 h', joined: ['maya', 'tony'], dist: '0.6 mi' },
  { id: 'mv-7', user: 'maya', title: 'Late pho', place: 'Pho Bang', cat: 'food', area: 'Richardson', at: [32.96845, -96.73095], status: 'ghost', pose: 'snack', time: '14 h', joined: ['dev'], dist: '1.3 mi' },
]
// on-the-way Moves are hidden: that friend is not at the Mark yet
const MOVES = ALL_MOVES.filter((m) => m.status !== 'omw')
const statusText = (m) => (m.status === 'ghost' ? `Left ${m.time} ago` : `There · ${m.time}`)
const pinDetail = (m) => (m.status === 'ghost' ? `${m.time} ago` : m.place)
// Snap-Map-style pin: full-body Bitmoji on a ground shadow with a name label. Static demo data only, so an HTML string is safe here.
const pinIcon = ({ img, name, detail, cat, status, extra = 0, delay = 0 }) => Leaflet.divIcon({
  className: 'pin-wrap', iconSize: [0, 0],
  html: `<div class="mv-pin ${status}" style="animation-delay:${delay}ms"><div class="mv-body"><img src="${img}" alt="">${cat ? `<span class="mv-badge" style="--c:${status === 'ghost' ? '#8a8d91' : CATS[cat][2]}">${CATS[cat][1]}</span>` : ''}</div><div class="mv-label"><b>${name}${extra ? ` <i>+${extra}</i>` : ''}</b><span>${detail}</span></div></div>`,
})
// center a point in the map area left open by the floating panel
const focus = (map, at, zoom, animate = true) => map?.fitBounds([at, at], { paddingTopLeft: [window.innerWidth > 900 ? PANEL_W : 0, 0], maxZoom: zoom, animate, duration: 0.65 })
const pinZ = (m, sel) => (sel ? 1000 : m.status === 'ghost' ? -500 : 0)

function MovesMap({ selectedId, onSelect, onClear, mapRef, mine }) {
  const el = useRef(null)
  const markers = useRef({})
  const meMarker = useRef(null)
  useEffect(() => {
    const map = Leaflet.map(el.current, { zoomControl: false })
    focus(map, MV_HOME, 15, false)
    Leaflet.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', { maxZoom: 20, attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors' }).addTo(map)
    Leaflet.control.zoom({ position: 'bottomright' }).addTo(map)
    MOVES.forEach((m, i) => {
      markers.current[m.id] = Leaflet.marker(m.at, { icon: pinIcon({ img: bit(m.user, m.pose), name: first(m.user), detail: pinDetail(m), cat: m.cat, status: m.status, extra: m.joined.length, delay: i * 70 }), title: `${first(m.user)} at ${m.place}`, zIndexOffset: pinZ(m) }).addTo(map).on('click', () => onSelect(m.id))
    })
    meMarker.current = Leaflet.marker(MY_POSITION, { icon: pinIcon({ img: bit('me', 'walk'), name: 'Me', detail: 'now', status: 'me' }), interactive: false, zIndexOffset: 500 }).addTo(map)
    map.on('click', onClear)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; markers.current = {} }
  }, [onSelect, onClear, mapRef])
  useEffect(() => {
    MOVES.forEach((m) => {
      const mk = markers.current[m.id]
      mk?.getElement()?.classList.toggle('sel', m.id === selectedId)
      mk?.setZIndexOffset(pinZ(m, m.id === selectedId))
    })
  }, [selectedId])
  useEffect(() => {
    // textContent, not HTML: this is typed by the user
    const label = meMarker.current?.getElement()?.querySelector('.mv-label span')
    if (label) label.textContent = mine || 'now'
  }, [mine])
  return <div ref={el} className="moves-map" />
}

// round Bitmoji selfie inside a Meta-gradient ring, the list-row avatar
function Face({ u, size = 52, ghost }) {
  return <span className={`mv-face${ghost ? ' ghost' : ''}`} style={{ width: size, height: size }}><img src={bit(u)} alt="" /></span>
}

function MoveRow({ m, pulled, onPick, onPull }) {
  const ghost = m.status === 'ghost'
  return (
    <div className="mv-row">
      <button className="mv-row-main" onClick={onPick}>
        <Face u={m.user} ghost={ghost} />
        <span className="grow">
          <span className="block clip"><b>{first(m.user)}</b> <span className={`small ${m.status === 'there' ? 'mv-live' : 'muted'}`}>{statusText(m)}</span></span>
          <span className="block clip">{m.title}</span>
          <span className="block clip muted">{m.place} · {m.dist}{m.joined.length > 0 && ` · +${m.joined.length} ${ghost ? 'went' : 'going'}`}</span>
        </span>
      </button>
      {!ghost && <button className={pulled ? 'btn-primary' : 'btn-blue mv-pull'} onClick={onPull}>{pulled ? 'Going' : 'Pull up'}</button>}
    </div>
  )
}

function MoveCard({ m, pulled, onPull, onClose }) {
  const ghost = m.status === 'ghost'
  const [label, , color, Icon] = CATS[m.cat]
  return (
    <div className="mv-card">
      <button className="icon-btn mv-close" aria-label="Close" onClick={onClose}><L.X size={18} /></button>
      <div className="mv-card-top">
        <img className={`mv-hero${ghost ? ' ghost' : ''}`} src={bit(m.user, m.pose)} alt="" />
        <div>
          <span className="mv-chip" style={ghost ? undefined : { '--c': color }}><Icon size={14} /> {label}</span>
          <h2>{MV_USERS[m.user][0]}</h2>
          <span className={`mv-status ${m.status === 'there' ? 'mv-live' : 'muted'}`}>{statusText(m)}</span>
        </div>
      </div>
      <p className="mv-title">“{m.title}”</p>
      <p className="row muted mv-place"><L.MapPin size={16} /> {m.place} · {m.area} · {m.dist}</p>
      {m.joined.length > 0 && (
        <div className="row">
          <span className="mv-faces">{m.joined.map((u) => <Face key={u} u={u} size={32} ghost={ghost} />)}</span>
          <span>{m.joined.map(first).join(', ')} {ghost ? 'went' : m.joined.length > 1 ? 'are there' : 'is there'}</span>
        </div>
      )}
      <div className="row mv-actions">
        {ghost
          ? <button className="btn-primary grow"><L.Images size={18} /> See Moments</button>
          : <button className={`grow ${pulled ? 'btn-blue' : 'btn-primary'}`} onClick={onPull}>{pulled ? <><L.Check size={18} /> You&apos;re going</> : <><L.Navigation size={18} /> Pull up</>}</button>}
        <button className="btn-gray"><L.MessageCircle size={18} /> Message</button>
      </div>
    </div>
  )
}

function Moves() {
  const [sel, setSel] = useState(null)
  const [query, setQuery] = useState('')
  const [pulled, setPulled] = useState({})
  const [draft, setDraft] = useState('')
  const [mine, setMine] = useState('')
  const [actsOpen, setActsOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [circles, setCircles] = useState(['Roommates'])
  const [people, setPeople] = useState([])
  const [shared, setShared] = useState('')
  const mapRef = useRef(null)
  const selected = MOVES.find((m) => m.id === sel)
  const select = useCallback((id) => {
    setSel(id)
    focus(mapRef.current, MOVES.find((m) => m.id === id).at, 17)
  }, [])
  const clear = useCallback(() => setSel(null), [])
  // everyone who would see the Move: members of the picked Circles plus people picked directly
  const audience = [...new Set([...circles.flatMap((c) => CIRCLES[c]), ...people])]
  const audienceLine = audience.length === 0 ? 'Pick at least one Circle or friend' : `Visible to ${audience.length} ${audience.length === 1 ? 'person' : 'people'}: ${[...circles, ...people.map(first)].join(', ')}`
  const toggleIn = (set) => (v) => set((xs) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]))
  // step 1: Enter opens the audience sheet. step 2: Share posts it.
  const share = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    if (!sheet) { setSheet(true); setActsOpen(false); return }
    if (audience.length === 0) return
    setMine(draft.trim())
    setShared(audienceLine)
    setDraft('')
    setSheet(false)
    clear()
    focus(mapRef.current, MY_POSITION, 17)
  }
  useEffect(() => {
    if (!shared) return
    const t = setTimeout(() => setShared(''), 5000)
    return () => clearTimeout(t)
  }, [shared])
  const togglePull = (id) => setPulled((p) => ({ ...p, [id]: !p[id] }))
  const q = query.trim().toLowerCase()
  const visible = q ? MOVES.filter((m) => `${MV_USERS[m.user][0]} ${m.title} ${m.place}`.toLowerCase().includes(q)) : MOVES
  const live = visible.filter((m) => m.status !== 'ghost')
  const ghosts = visible.filter((m) => m.status === 'ghost')
  const out = MOVES.filter((m) => m.status !== 'ghost')
  return (
    <main className="moves-main">
      <MovesMap selectedId={sel} onSelect={select} onClear={clear} mapRef={mapRef} mine={mine} />
      <aside className="mv-glass mv-panel" aria-label="Moves">
        {selected ? <MoveCard m={selected} pulled={!!pulled[selected.id]} onPull={() => togglePull(selected.id)} onClose={clear} /> : (
          <>
            <div className="row mv-head">
              <input className="pill-input" placeholder="Search friends and Moves" aria-label="Search friends and Moves" value={query} onChange={(e) => setQuery(e.target.value)} />
              <Face u="me" size={44} />
            </div>
            {!q && <>
              <h3>Out now</h3>
              <div className="mv-out">
                {out.map((m) => (
                  <button key={m.id} className="mv-out-item" onClick={() => select(m.id)}>
                    <Face u={m.user} size={64} />
                    <b className="block clip">{first(m.user)}</b>
                    <span className="muted block clip">{CATS[m.cat][0]}</span>
                  </button>
                ))}
              </div>
            </>}
            {live.length > 0 && <><h3>Happening now</h3><div className="mv-group">{live.map((m) => <MoveRow key={m.id} m={m} pulled={!!pulled[m.id]} onPick={() => select(m.id)} onPull={() => togglePull(m.id)} />)}</div></>}
            {ghosts.length > 0 && <><h3>Earlier</h3><div className="mv-group">{ghosts.map((m) => <MoveRow key={m.id} m={m} onPick={() => select(m.id)} />)}</div></>}
            {visible.length === 0 && <p className="muted center">No Moves match “{query}”.</p>}
          </>
        )}
      </aside>
      <div className="mv-top">
        <div className="mv-glass mv-title-pill">
          <span><b className="block">Richardson</b><span className="muted row"><L.Users size={14} /> {out.length} friends out</span></span>
          <span className="mv-weather" role="img" aria-label="Weather: 73 degrees and sunny"><L.Sun size={28} fill="currentColor" /><span><b className="block">73°</b><span className="muted">Sunny</span></span></span>
        </div>
        <button className="mv-glass mv-recenter" aria-label="Center on me" onClick={() => { clear(); focus(mapRef.current, MV_HOME, 15) }}><L.Navigation size={20} fill="currentColor" /></button>
      </div>
      <form className="mv-dock" onSubmit={share} onKeyDown={(e) => e.key === 'Escape' && setSheet(false)}>
        <p className={`mv-glass mv-shared${shared ? '' : ' hide'}`} role="status">{shared && <><L.CheckCircle2 size={16} /> Shared. {shared}</>}</p>
        {sheet && (
          <section className="mv-glass mv-acts mv-sheet" aria-label="Choose who sees your Move">
            <div className="row between"><h3>Share your Move</h3><button type="button" className="icon-btn mv-close-inline" aria-label="Cancel" onClick={() => setSheet(false)}><L.X size={18} /></button></div>
            <div className="row mv-preview"><Face u="me" size={44} /><span className="grow"><b className="block clip">{draft.trim() || 'What are you up to?'}</b><span className="muted row"><L.MapPin size={14} /> Pinned where you are now</span></span></div>
            <h4>Circles</h4>
            <div className="mv-picks">
              {Object.keys(CIRCLES).map((c) => (
                <button key={c} type="button" className="mv-pick" aria-pressed={circles.includes(c)} onClick={() => toggleIn(setCircles)(c)}><L.Users size={15} /> {c} <span className="mv-count">{CIRCLES[c].length}</span></button>
              ))}
            </div>
            <h4>Friends</h4>
            <div className="mv-picks">
              {Object.keys(MV_USERS).map((u) => (
                <button key={u} type="button" className="mv-pick mv-person" aria-pressed={people.includes(u)} onClick={() => toggleIn(setPeople)(u)}><Face u={u} size={24} /> {first(u)}</button>
              ))}
            </div>
            <p className={`mv-audience row${audience.length === 0 ? ' warn' : ''}`} aria-live="polite">{audience.length === 0 ? <L.EyeOff size={16} /> : <L.Eye size={16} />} {audienceLine}</p>
            <button type="submit" className="btn-primary mv-send" disabled={audience.length === 0 || !draft.trim()}>Share Move</button>
          </section>
        )}
        {actsOpen && (
          <section id="mv-acts" className="mv-glass mv-acts" aria-label="What friends are up to">
            <h3>What friends are up to</h3>
            <div className="mv-acts-grid">
              {out.map((m) => {
                const [label, , color, Icon] = CATS[m.cat]
                return (
                  <button key={m.id} type="button" className="mv-act" onClick={() => { select(m.id); setActsOpen(false) }}>
                    <span className="mv-act-icon" style={{ '--c': color }}><Icon size={22} /></span>
                    <span className="grow">
                      <b className="block clip">{label} at {m.place}</b>
                      <span className="row muted"><Face u={m.user} size={22} /><span className="clip">{first(m.user)}{m.joined.length > 0 && ` +${m.joined.length}`} · {m.time}</span></span>
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
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What are you up to?" aria-label="Share a Move, press Enter to choose who sees it" maxLength={60} enterKeyHint="next" />
        </div>
      </form>
    </main>
  )
}

// ---- Memories: photo albums synced from past Moves where friends showed up together
const MEM_PHOTOS = { 'mv-6': [['p3', 'maya'], ['p5', 'tony']], 'mv-7': [['p2', 'dev']] }
const MEMORIES = [
  // ended Moves that someone joined become a shared album
  ...MOVES.filter((m) => m.status === 'ghost' && m.joined.length > 0).map((m) => ({ id: m.id, title: m.title, place: m.place, cat: m.cat, when: `${m.time} ago`, who: [m.user, ...m.joined], photos: MEM_PHOTOS[m.id] ?? [] })),
  { id: 'mem-1', title: 'Matcha and PSET grind', place: 'Kumo Matcha', cat: 'coffee', when: 'Sat, Nov 7', who: ['priya', 'maya', 'jordan'], photos: [['p1', 'priya'], ['p4', 'jordan']] },
  { id: 'mem-2', title: 'Leg day', place: 'Activity Center', cat: 'gym', when: 'Thu, Nov 5', who: ['tony', 'dev'], photos: [['p6', 'tony']] },
].map((m) => ({ ...m, photos: m.photos.map(([p, by]) => [`/fb/memories/${p}.jpg`, by]) }))
const who = (u) => (u === 'me' ? 'You' : first(u))

function Memories() {
  // photos I add this session: { memoryId: [[objectUrl, 'me']] }
  const [added, setAdded] = useState({})
  const add = (id, files) => setAdded((a) => ({ ...a, [id]: [...(a[id] ?? []), ...[...files].map((f) => [URL.createObjectURL(f), 'me'])] }))
  return (
    <div className="page">
      <SideNav title="Memories" gear={false} items={[['Memories Home', L.Images], ['Notifications', L.Bell], ['Highlights', L.Sparkles], ['Hide People', L.UserX], ['Hide Dates', L.CalendarX]]} />
      <main className="page-main narrow">
        <img className="mem-banner" src="/fb/memories-header.png" alt="" />
        <h2>Memories from your outings</h2>
        <p className="muted mem-sub">Every time friends show up to the same Move, it lands here as a shared album. Only the people who were there can see it and add photos.</p>
        {MEMORIES.map((m) => {
          const [, , color, Icon] = CATS[m.cat]
          const photos = [...m.photos, ...(added[m.id] ?? [])]
          return (
            <article key={m.id} className="card mem">
              <div className="row">
                <span className="mv-act-icon" style={{ '--c': color }}><Icon size={22} /></span>
                <div className="grow"><b className="block clip mem-title">{m.title}</b><span className="muted">{m.place} · {m.when}</span></div>
                <label className="btn-blue mem-add"><L.ImagePlus size={16} /> Add photos<input className="sr-only" type="file" accept="image/*" multiple onChange={(e) => { add(m.id, e.target.files); e.target.value = '' }} /></label>
              </div>
              <div className="row mem-who"><span className="mv-faces">{m.who.map((u) => <Face key={u} u={u} size={32} />)}</span><span>{m.who.map(first).join(', ')} and you showed up</span></div>
              <div className="mem-grid">
                {photos.map(([src, by], i) => (
                  <figure key={src}>
                    <img src={src} alt={`Photo ${i + 1} from ${m.title}, added by ${who(by)}`} loading="lazy" />
                    <figcaption><Face u={by} size={22} /> {who(by)}</figcaption>
                    <a className="mem-dl" href={src} download={`${m.title} ${i + 1}.jpg`} aria-label={`Download photo ${i + 1} from ${m.title}`}><L.Download size={16} /></a>
                  </figure>
                ))}
              </div>
            </article>
          )
        })}
      </main>
    </div>
  )
}

// ---- Skeleton loaders: one shimmer block, composed into a placeholder per page layout
const Skel = ({ w = '100%', h = 14, r = 8, className = '' }) => <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r }} />
const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i))
const SkelRow = ({ size = 36 }) => <div className="skel-row"><Skel w={size} h={size} r="50%" /><span className="grow"><Skel w="70%" /><Skel w="45%" h={10} /></span></div>
const SkelSide = ({ dark }) => <aside className={`side-nav${dark ? ' dark' : ''}`}><Skel w={160} h={28} /><Skel h={36} r={18} />{times(7, (i) => <SkelRow key={i} />)}</aside>

function PageSkeleton({ view }) {
  const body = view === 'Home' ? (
    <div className="layout">
      <div className="left-rail">{times(8, (i) => <SkelRow key={i} />)}</div>
      <main className="feed">
        <div className="stories">{times(5, (i) => <Skel key={i} className="skel-story" w={140} h={250} r={12} />)}</div>
        <div className="card"><SkelRow size={40} /></div>
        {times(2, (i) => <div key={i} className="card"><SkelRow size={40} /><Skel w="90%" /><Skel w="60%" /><Skel h={300} /></div>)}
      </main>
      <div className="right-rail">{times(6, (i) => <SkelRow key={i} />)}</div>
    </div>
  ) : view === 'Video' ? (
    <div className="page reels"><SkelSide dark /><div className="reel-stage"><Skel className="skel-reel" w="auto" h="calc(100vh - 96px)" r={12} /></div></div>
  ) : view === 'Memories' ? (
    <div className="page">
      <SkelSide />
      <main className="page-main narrow"><Skel h={150} r={12} /><Skel w={280} h={24} />{times(2, (i) => <div key={i} className="card"><SkelRow size={44} /><div className="mem-grid">{times(3, (j) => <Skel key={j} className="skel-sq" h="auto" r={12} />)}</div></div>)}</main>
    </div>
  ) : view === 'Moves' ? (
    <main className="moves-main skel-map">
      <aside className="mv-glass mv-panel"><Skel h={44} r={22} /><div className="skel-circles">{times(4, (i) => <Skel key={i} w={64} h={64} r="50%" />)}</div>{times(5, (i) => <SkelRow key={i} size={52} />)}</aside>
    </main>
  ) : (
    <div className="page">
      <SkelSide />
      <main className="page-main"><Skel w={200} h={24} /><div className="grid listings">{times(10, (i) => <div key={i}><Skel className="skel-sq" h="auto" /><Skel w="50%" h={18} /><Skel w="80%" /></div>)}</div></main>
    </div>
  )
  return <div role="status" aria-busy="true" aria-label={`Loading ${view}`}>{body}</div>
}

export default function App() {
  const [view, setView] = useState('Home')
  const [posts, setPosts] = useState(INITIAL_POSTS)
  const update = (id, fn) => setPosts((ps) => ps.map((p) => (p.id === id ? fn(p) : p)))
  const [loaded, setLoaded] = useState([])
  const loading = !loaded.includes(view)
  useEffect(() => {
    if (!loading) return
    // shortcut: simulated first-visit load (pages are static demo data), drive this from fetch state once pages load real data
    const t = setTimeout(() => setLoaded((l) => [...l, view]), 600)
    return () => clearTimeout(t)
  }, [view, loading])
  return (
    <>
      <TopNav view={view} setView={setView} />
      {loading ? <PageSkeleton view={view} /> : <>
      {view === 'Friends' && <FriendsPage />}
      {view === 'Video' && <Reels />}
      {view === 'Marketplace' && <Marketplace />}
      {view === 'Groups' && <Groups />}
      {view === 'Moves' && <Moves />}
      {view === 'Memories' && <Memories />}
      {view === 'Home' && <div className="layout">
        <LeftRail setView={setView} />
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
      </div>}
      </>}
    </>
  )
}
