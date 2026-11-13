import { create } from 'zustand';

import { bitmojiPoseFor } from './mock/bitmoji';
import { avatars } from './mock/assets';
import { users as mockUsers } from './mock';
import { mapMoves, myPosition, type MapMove, type MoveCategory } from './mock/moves';
import type { User } from './mock/types';
import { api, useSession, type UserLite } from './session';

/**
 * The Moves world from the backend (ARCHITECTURE.md 7.1): live Moves the user
 * can see (`GET /moves/nearby`, Muse-ranked) plus ghosts of people who left a
 * Move in the last day (`GET /marks/nearby`), shaped as the map's `MapMove`.
 * Falls back to the bundled mock world when the backend can't be reached.
 */

type ParticipantWire = { user: UserLite; status: 'going' | 'there' | 'left'; joined_via: string };
type MoveWire = {
  id: string;
  creator: UserLite;
  mark: { id: string; name: string; category: string; lat: number; lng: number; address: string };
  text: string;
  category: string;
  status: string;
  starts_at: string;
  participants: ParticipantWire[];
  my_status: 'going' | 'there' | 'left' | null;
  muse_reason: string | null;
};
type GhostMarkWire = {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  address: string;
  ghosts: { user: UserLite; move_id: string; at: string }[] | null;
};

const CATEGORY: Record<string, MoveCategory> = {
  food: 'food',
  coffee: 'coffee',
  study: 'study',
  fitness: 'gym',
  nightlife: 'party',
  outdoors: 'gym',
  games: 'party',
  shopping: 'shopping',
  errand: 'shopping',
  other: 'music',
};

const AVATARS = Object.values(avatars);

/** A backend user as the app's `User`; reuses the bundled photo for the cast. */
export function toUser(u: UserLite): User {
  const mock = mockUsers.find((m) => m.id === u.id.replace(/_/g, '-'));
  const hash = [...u.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    id: u.id,
    kind: 'person',
    name: u.name,
    firstName: u.first_name,
    avatar: mock?.avatar ?? AVATARS[hash % AVATARS.length],
    verified: true,
    mutualFriends: 0,
    isFriend: true,
    online: false,
    subtitle: '',
  };
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} m`;
  return `${Math.round(minutes / 60)} h`;
}

function miles(lat: number, lng: number): string {
  const rad = Math.PI / 180;
  const dLat = (lat - myPosition.latitude) * rad;
  const dLng = (lng - myPosition.longitude) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(myPosition.latitude * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return `${(12742 * Math.asin(Math.sqrt(a)) * 0.621).toFixed(1)} mi`;
}

const area = (address: string) => address.split(',').pop()?.trim() || 'Nearby';

function fromMove(m: MoveWire, me: string): MapMove {
  const category = CATEGORY[m.category] ?? 'music';
  const creator = m.participants.find((p) => p.user.id === m.creator.id);
  return {
    id: m.id,
    user: toUser(m.creator),
    title: m.text,
    mark: { id: m.mark.id, name: m.mark.name, category, coordinate: { latitude: m.mark.lat, longitude: m.mark.lng }, area: area(m.mark.address) },
    status: creator?.status === 'going' ? 'omw' : 'there',
    pose: bitmojiPoseFor(category),
    timeLabel: ago(m.starts_at),
    joined: m.participants.filter((p) => p.user.id !== m.creator.id && p.status !== 'left').map((p) => toUser(p.user)),
    distanceLabel: miles(m.mark.lat, m.mark.lng),
    mine: m.creator.id === me,
    going: m.my_status === 'going' || m.my_status === 'there',
    reason: m.muse_reason ?? undefined,
  };
}

/** One ghost pin per finished Move at a Mark: the first person, the rest joined. */
function fromGhosts(mark: GhostMarkWire): MapMove[] {
  const byMove = new Map<string, NonNullable<GhostMarkWire['ghosts']>>();
  for (const g of mark.ghosts ?? []) byMove.set(g.move_id, [...(byMove.get(g.move_id) ?? []), g]);
  const category = CATEGORY[mark.category] ?? 'music';
  return [...byMove.entries()].map(([moveId, ghosts]) => ({
    id: `ghost-${moveId}-${mark.id}`,
    user: toUser(ghosts[0].user),
    title: `Was at ${mark.name}`,
    mark: { id: mark.id, name: mark.name, category, coordinate: { latitude: mark.lat, longitude: mark.lng }, area: area(mark.address) },
    status: 'ghost',
    pose: bitmojiPoseFor(category),
    timeLabel: ago(ghosts[0].at),
    joined: ghosts.slice(1).map((g) => toUser(g.user)),
    distanceLabel: miles(mark.lat, mark.lng),
  }));
}

type LiveState = {
  /** null until the first load finishes. */
  moves: MapMove[] | null;
  online: boolean;
  load: () => Promise<void>;
  /** Pull up (or take it back) with an optimistic flip; reloads after. */
  toggleGoing: (id: string) => Promise<void>;
};

export const useLive = create<LiveState>()((set, get) => ({
  moves: null,
  online: false,
  load: async () => {
    const me = useSession.getState().userId;
    const near = `lat=${myPosition.latitude}&lng=${myPosition.longitude}&radius_km=25`;
    try {
      const [live, marks] = await Promise.all([
        api<MoveWire[]>(`/moves/nearby?${near}`),
        api<GhostMarkWire[]>(`/marks/nearby?${near}`).catch(() => [] as GhostMarkWire[]),
      ]);
      set({ online: true, moves: [...live.map((m) => fromMove(m, me)), ...marks.flatMap(fromGhosts)] });
    } catch {
      set({ online: false, moves: mapMoves });
    }
  },
  toggleGoing: async (id) => {
    const move = get().moves?.find((m) => m.id === id);
    if (!move || move.mine || move.status === 'ghost') return;
    const going = !move.going;
    set((s) => ({ moves: s.moves?.map((m) => (m.id === id ? { ...m, going } : m)) ?? null }));
    if (!get().online) return;
    try {
      await api(`/moves/${encodeURIComponent(id)}/${going ? 'join' : 'leave'}`, { method: 'POST' });
    } finally {
      await get().load();
    }
  },
}));
