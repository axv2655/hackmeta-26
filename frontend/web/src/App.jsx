import { useState } from 'react'
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
const Gamepad2 = pick('gaming', L.Gamepad2)
const Menu = pick('menu', L.Menu)
const MessageCircle = pick('messages', L.MessageCircle)
const Bell = pick('notifications', L.Bell)
const Globe = pick('globe', L.Globe)
const ThumbsUp = pick('like', L.ThumbsUp)
const MessageSquare = pick('comment', L.MessageSquare)
const Share2 = pick('share', L.Share2)
const Video = pick('live', L.Video)
const Image = pick('photo', L.Image)
const Smile = pick('feeling', L.Smile)
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

function TopNav() {
  return (
    <header className="topnav">
      <div className="topnav-left">
        <img className="logo" src="/logo.svg" alt="Home" />
        <input className="search" placeholder="Search" aria-label="Search" />
      </div>
      <nav className="topnav-center" aria-label="Primary">
        {[['Home', Home], ['Video', MonitorPlay], ['Marketplace', Store], ['Groups', Users], ['Gaming', Gamepad2]].map(([t, I], i) => (
          <button key={t} className={`tab ${i === 0 ? 'active' : ''}`} aria-label={t} title={t}><I size={26} /></button>
        ))}
      </nav>
      <div className="topnav-right">
        {[['Menu', Menu], ['Messages', MessageCircle], ['Notifications', Bell]].map(([t, I]) => <button key={t} className="circle-btn" aria-label={t} title={t}><I size={20} /></button>)}
        <Avatar name={ME} size={40} />
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
      </div>
      <div className="divider" />
      <div className="actions">
        <button type="button"><Video color="#f02849" /> Live video</button>
        <button type="button"><Image color="#45bd62" /> Photo/video</button>
        <button type="submit"><Smile color="#f7b928" /> Post</button>
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
      <div className="row counts muted">
        <span className="row"><span className="like-badge"><ThumbsUp size={10} fill="#fff" /></span>{post.likes + (post.liked ? 1 : 0)}</span>
        <span>{post.comments.length} comment{post.comments.length === 1 ? '' : 's'} · {post.shares} share{post.shares === 1 ? '' : 's'}</span>
      </div>
      <div className="divider" />
      <div className="actions">
        <button className={post.liked ? 'liked' : ''} onClick={onLike} aria-pressed={!!post.liked}><ThumbsUp fill={post.liked ? 'currentColor' : 'none'} /> Like</button>
        <button onClick={() => document.getElementById(`c${post.id}`).focus()}><MessageSquare /> Comment</button>
        <button><Share2 /> Share</button>
      </div>
      <div className="divider" />
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
