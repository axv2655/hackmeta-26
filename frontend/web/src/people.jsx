// Faces for people: real users (UserLite from the backend) or demo names on the still-static pages.

const hue = (s) => [...s].reduce((h, c) => h + c.charCodeAt(0), 0) % 360
// same 3 placeholder photos as Cadence (Team-37-backend Avatar.tsx); picked per name, initials show if offline
const PFPS = [
  'https://cdn.21st.dev/assets/localized/f9ec2aa53d0e5399b925d1dc86f057ffd36f42755e94579862cf6ee4b68a06d1.png',
  'https://cdn.21st.dev/assets/localized/7bdeb01a33494b48dfd2e499ed79069c4d6538c0f8f0eeff3c6c323f3d29be4c.png',
  'https://cdn.21st.dev/assets/localized/11a67bb27c5e011bb9028042fa7fb6eba2bc69a09c43cec351ada077cc4b869d.png',
]
export const pfp = (name) => PFPS[hue(name) % PFPS.length]

/** `user` (UserLite) uses its avatar_url / avatar_color; `name` alone gets a demo photo. */
export function Avatar({ user, name = user?.name ?? '?', size = 40 }) {
  const src = user ? user.avatar_url : pfp(name)
  const bg = user?.avatar_color || `hsl(${hue(name)} 55% 50%)`
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: bg }} aria-hidden="true">
      {name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
      {src && <img src={src} alt="" onError={(e) => e.currentTarget.remove()} />}
    </span>
  )
}

// Placeholder Bitmoji sets a/b in public/fb/bitmoji, same assignment as mobile lib/mock/bitmoji.ts.
const SET = { u_anish: 'b', u_tony: 'b', u_maya: 'a', u_priya: 'a', u_dev: 'b', u_dhivyesh: 'b', u_jordan: 'a' }
const setFor = (id) => SET[id] ?? ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 2 ? 'a' : 'b')
export const bit = (userId, pose = 'selfie') => `/fb/bitmoji/${setFor(userId)}/${pose}.png`
const POSE = { study: 'study', fitness: 'gym', outdoors: 'gym', nightlife: 'dance', games: 'dance', shopping: 'strut', errand: 'strut', coffee: 'snack', food: 'snack', other: 'music' }
export const poseFor = (category) => POSE[category] ?? 'walk'

/** Round Bitmoji selfie inside a Meta-gradient ring. */
export function Face({ id, size = 52, ghost }) {
  return <span className={`mv-face${ghost ? ' ghost' : ''}`} style={{ width: size, height: size }}><img src={bit(id)} alt="" /></span>
}
