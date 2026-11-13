import { create } from 'zustand';

import { errorMessage } from './backend';
import { categoryMeta, type CategoryMeta } from './categories';
import { mockAllowed } from './demo';
import { endpoints } from './endpoints';
import { appEvents } from './events';
import { ago, miles } from './format';
import { coarse, here, kmBetween, useLocation } from './location';
import { bitmojiPoseFor } from './mock/bitmoji';
import { CAMPUS_CENTER, mapMoves, type Coordinate, type MapMove, type MoveCategory } from './mock/moves';
import { toUser } from './people';
import { onLogout, useSession } from './session';
import { tendencyText } from './tendency';
import { toast } from './toast';
import type { Category, Move, NearbyMark, ParticipantStatus } from './types';

/**
 * The Moves world from the backend (ARCHITECTURE.md 7.1): live Moves the user
 * can see (`GET /moves/nearby`, Muse-ranked, so list order is Muse's order)
 * plus ghosts of people who were at a Move in the last day (`GET /marks/nearby`),
 * shaped as the map's `MapMove`. The user's own live Moves come from
 * `GET /moves/feed` when they are outside the nearby radius.
 *
 * Mock rule (lib/demo): the bundled world shows only when `mockAllowed(e)`
 * (demo build or no network), and then `sample` is true and nothing mutates.
 * An HTTP error keeps the last good Moves and sets `error`.
 */

const RADIUS_KM = 25;

type Status = 'idle' | 'loading' | 'ready' | 'error';

const POSE_GROUP: Record<MoveCategory, Category> = {
  coffee: 'coffee',
  study: 'study',
  gym: 'fitness',
  party: 'nightlife',
  music: 'other',
  food: 'food',
  shopping: 'shopping',
};

/** Label, icon and color for a pin or row (all 10 backend categories). */
export function moveMeta(m: MapMove): CategoryMeta {
  return categoryMeta(m.category ?? POSE_GROUP[m.mark.category]);
}

/** How many people are at the Move now and how many are on the way. */
export function moveCounts(m: MapMove): { there: number; onTheWay: number } {
  const people = m.participants ?? [];
  return {
    there: people.filter((p) => p.status === 'there').length,
    onTheWay: people.filter((p) => p.status === 'going').length,
  };
}

/** The real Move id behind a pin (ghost pins have their own pin id). */
export const realMoveId = (m: MapMove): string => m.moveId ?? m.id;

const area = (address: string) => address.split(',').pop()?.trim() || 'Nearby';

function distanceLabel(lat: number, lng: number): string {
  if (!useLocation.getState().coords) return '';
  return miles(kmBetween(here(), { latitude: lat, longitude: lng }));
}

function toMark(m: { id: string; name: string; category: string; lat: number; lng: number; address: string }) {
  const pin = categoryMeta(m.category).pin;
  return {
    id: m.id,
    name: m.name,
    category: pin,
    coordinate: { latitude: m.lat, longitude: m.lng },
    area: area(m.address),
  };
}

export function fromMove(m: Move, me: string): MapMove {
  const mark = toMark(m.mark);
  const creator = m.participants.find((p) => p.user.id === m.creator.id);
  const active = m.participants.filter((p) => p.status !== 'left');
  return {
    id: m.id,
    moveId: m.id,
    user: toUser(m.creator),
    title: m.text,
    mark,
    category: m.category,
    status: creator?.status === 'going' ? 'omw' : 'there',
    pose: bitmojiPoseFor(mark.category),
    timeLabel: ago(m.starts_at),
    joined: active.filter((p) => p.user.id !== m.creator.id).map((p) => toUser(p.user)),
    participants: active.map((p) => ({ user: toUser(p.user), status: p.status })),
    distanceLabel: distanceLabel(m.mark.lat, m.mark.lng),
    mine: m.creator.id === me,
    going: m.my_status === 'going' || m.my_status === 'there',
    myStatus: m.my_status,
    reason: m.muse_reason ?? undefined,
    tendency: tendencyText(m) ?? undefined,
    kind: m.kind,
    fillDeadline: m.fill_deadline,
    open: m.open,
  };
}

/** One ghost pin per finished Move at a Mark: the first person, the rest joined. */
function fromGhosts(mark: NearbyMark): MapMove[] {
  const byMove = new Map<string, NearbyMark['ghosts']>();
  for (const g of mark.ghosts ?? []) byMove.set(g.move_id, [...(byMove.get(g.move_id) ?? []), g]);
  const pinMark = toMark(mark);
  return [...byMove.entries()].map(([moveId, ghosts]) => ({
    id: `ghost-${moveId}-${mark.id}`,
    moveId,
    user: toUser(ghosts[0].user),
    title: ghosts[0].text || `Was at ${mark.name}`,
    mark: pinMark,
    category: mark.category,
    status: 'ghost' as const,
    pose: bitmojiPoseFor(pinMark.category),
    timeLabel: ago(ghosts[0].at),
    joined: ghosts.slice(1).map((g) => toUser(g.user)),
    distanceLabel: distanceLabel(mark.lat, mark.lng),
  }));
}

type World = { moves: MapMove[]; nearCampus: boolean };

async function fetchAround(at: Coordinate): Promise<{ live: Move[]; marks: NearbyMark[] }> {
  const c = coarse(at);
  // Staggered so the server never takes the calls in the same instant.
  const [live, marks] = await Promise.all([
    endpoints.moves.nearby(c.latitude, c.longitude, RADIUS_KM),
    after(STAGGER_MS, () => endpoints.marks.nearby(c.latitude, c.longitude, RADIUS_KM)).catch(() => [] as NearbyMark[]),
  ]);
  return { live, marks };
}

/** Gap between the calls of one refresh (nearby Moves, then Marks, then the feed). */
const STAGGER_MS = 300;

function after<T>(ms: number, run: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => setTimeout(() => run().then(resolve, reject), ms));
}

const hasAnything = (r: { live: Move[]; marks: NearbyMark[] }) =>
  r.live.length > 0 || r.marks.some((m) => (m.ghosts ?? []).length > 0);

/** Nearby around the phone; if nothing is within 25 km, around campus (where the seeded world is). */
async function fetchWorld(me: string): Promise<World> {
  const feed = after(STAGGER_MS * 2, () => endpoints.moves.feed()).catch(() => [] as Move[]);
  let result = await fetchAround(here());
  let nearCampus = false;
  if (!hasAnything(result) && kmBetween(here(), CAMPUS_CENTER) > RADIUS_KM) {
    result = await fetchAround(CAMPUS_CENTER);
    nearCampus = true;
  }
  const ids = new Set(result.live.map((m) => m.id));
  const ownMissing = (await feed).filter((m) => m.creator.id === me && m.status === 'live' && !ids.has(m.id));
  const live = [...ownMissing, ...result.live].map((m) => fromMove(m, me));
  return { moves: [...live, ...result.marks.flatMap(fromGhosts)], nearCampus };
}

function withMyStatus(m: MapMove, status: ParticipantStatus | null, meId: string): MapMove {
  const others = (m.participants ?? []).filter((p) => p.user.id !== meId);
  const meUser = useSession.getState().me?.user;
  const mine = (m.participants ?? []).find((p) => p.user.id === meId) ?? (meUser ? { user: toUser(meUser), status } : null);
  const participants = status && mine ? [...others, { ...mine, status }] : others;
  return { ...m, myStatus: status, going: status === 'going' || status === 'there', participants };
}

type LiveState = {
  /** null until the first load finishes. */
  moves: MapMove[] | null;
  status: Status;
  error: string | null;
  /** True while the bundled sample world is showing (demo build or no network). */
  sample: boolean;
  /** True when nothing was near the phone, so the map shows the campus world instead. */
  nearCampus: boolean;
  /** Kept for older callers: true once real data loaded. */
  online: boolean;
  load: () => Promise<void>;
  /** Pull up, or take back a Pull up (`going` only). Optimistic with rollback. */
  toggleGoing: (id: string) => Promise<void>;
};

const initial = {
  moves: null,
  status: 'idle' as Status,
  error: null,
  sample: false,
  nearCampus: false,
  online: false,
};

let inflight: Promise<void> | null = null;

export const useLive = create<LiveState>()((set, get) => ({
  ...initial,
  load: async () => {
    const me = useSession.getState().userId;
    if (!me) return;
    if (inflight) return inflight;
    if (get().moves === null) set({ status: 'loading', error: null });
    inflight = (async () => {
      try {
        const world = await fetchWorld(me);
        set({ ...world, status: 'ready', error: null, sample: false, online: true });
      } catch (e) {
        if (mockAllowed(e)) {
          set({ moves: mapMoves, status: 'ready', error: null, sample: true, nearCampus: false, online: false });
        } else {
          set({ status: 'error', error: errorMessage(e) });
        }
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  toggleGoing: async (id) => {
    const move = get().moves?.find((m) => m.id === id);
    if (!move || move.mine || move.status === 'ghost') return;
    if (move.myStatus === 'left' || move.myStatus === 'there') return;
    if (get().sample) {
      toast("You're offline");
      return;
    }
    const me = useSession.getState().userId;
    const takeBack = move.myStatus === 'going';
    const patch = (fn: (m: MapMove) => MapMove) =>
      set((s) => ({ moves: s.moves?.map((m) => (m.id === id ? fn(m) : m)) ?? null }));
    patch((m) => withMyStatus(m, takeBack ? null : 'going', me));
    try {
      const moveId = realMoveId(move);
      const fresh = takeBack ? await endpoints.moves.leave(moveId) : await endpoints.moves.join(moveId);
      patch(() => fromMove(fresh, me));
      appEvents.emit('moves.changed', { move_id: moveId });
    } catch (e) {
      patch(() => move);
      toast(errorMessage(e));
    }
  },
}));

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void useLive.getState().load(), 250);
}

const RELOAD_ON = [
  'move.created',
  'move.updated',
  'move.ended',
  'participant.changed',
  'moment.added',
  'notification',
  'socket.open',
  'moves.changed',
];
for (const type of RELOAD_ON) appEvents.on(type, reloadSoon);
onLogout(() => useLive.setState(initial));
