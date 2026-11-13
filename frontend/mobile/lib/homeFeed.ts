import { create } from 'zustand';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { onLogout, useMe, useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { Move, Participant, Person, UserLite } from '@/lib/types';

/**
 * Live Moves for the Home "Moves from friends" unit: GET /moves/feed (already
 * Muse-ranked, each with a one-line `muse_reason`). Reloads on every server
 * Move event, on each socket (re)connect and after any local Move mutation.
 * Pull up / leave are optimistic and roll back with a toast.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';

type HomeFeedState = {
  moves: Move[];
  status: Status;
  error: string | null;
  /** Move ids with a Pull up / leave request in flight. */
  busy: Record<string, true>;
  load: () => Promise<void>;
  /** Pull up when not in the Move, leave when going. `me` is the signed-in user for the optimistic row. */
  togglePullUp: (id: string, me: UserLite | null) => Promise<void>;
};

const MOVE_EVENTS = ['move.created', 'move.updated', 'move.ended', 'participant.changed'] as const;

function withMe(move: Move, me: UserLite | null): Move {
  const others = move.participants.filter((p) => p.user.id !== me?.id);
  const mine: Participant[] = me ? [{ user: me, status: 'going', joined_via: 'tap' }] : [];
  return { ...move, my_status: 'going', participants: [...others, ...mine] };
}

function withoutMe(move: Move, me: UserLite | null): Move {
  const participants = move.participants.filter((p) => p.user.id !== me?.id);
  return { ...move, my_status: null, participants };
}

const replace = (moves: Move[], next: Move): Move[] => moves.map((m) => (m.id === next.id ? next : m));

const dropBusy = (busy: Record<string, true>, id: string): Record<string, true> => {
  const { [id]: _gone, ...rest } = busy;
  return rest;
};

let inflight: Promise<void> | null = null;

export const useHomeFeed = create<HomeFeedState>()((set, get) => ({
  moves: [],
  status: 'idle',
  error: null,
  busy: {},
  load: () => {
    if (!useSession.getState().userId) return Promise.resolve();
    if (inflight) return inflight;
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    inflight = (async () => {
      try {
        const moves = await endpoints.moves.feed();
        set({ moves: moves.filter((m) => m.status === 'live'), status: 'ready', error: null });
      } catch (e) {
        set({ status: 'error', error: errorMessage(e) });
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  togglePullUp: async (id, me) => {
    const before = get().moves.find((m) => m.id === id);
    if (!before || get().busy[id]) return;
    const leaving = before.my_status === 'going';
    const optimistic = leaving ? withoutMe(before, me) : withMe(before, me);
    set((s) => ({ moves: replace(s.moves, optimistic), busy: { ...s.busy, [id]: true } }));
    try {
      const server = leaving ? await endpoints.moves.leave(id) : await endpoints.moves.join(id);
      set((s) => ({ moves: replace(s.moves, server), busy: dropBusy(s.busy, id) }));
      appEvents.emit('moves.changed');
    } catch (e) {
      set((s) => ({ moves: replace(s.moves, before), busy: dropBusy(s.busy, id) }));
      toast(errorMessage(e));
    }
  },
}));

/** Pull up / leave bound to the signed-in user. */
export function usePullUp(): (id: string) => Promise<void> {
  const me = useMe();
  const toggle = useHomeFeed((s) => s.togglePullUp);
  return (id: string) => toggle(id, me);
}

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function reloadSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void useHomeFeed.getState().load(), 300);
}

for (const type of MOVE_EVENTS) appEvents.on(type, reloadSoon);
appEvents.on('socket.open', reloadSoon);
appEvents.on('moves.changed', reloadSoon);
onLogout(() => useHomeFeed.setState({ moves: [], status: 'idle', error: null, busy: {} }));

// --- People you may know ----------------------------------------------------

type PymkState = {
  people: Person[];
  status: Status;
  load: () => Promise<void>;
};

/** GET /friends/suggestions?limit=10 for the Home "People you may know" unit. */
export const usePeopleYouMayKnow = create<PymkState>()((set) => ({
  people: [],
  status: 'idle',
  load: async () => {
    if (!useSession.getState().userId) return;
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading' }));
    try {
      const people = await endpoints.friends.suggestions(10);
      set({ people: people.filter((p) => p.relation !== 'self' && p.relation !== 'friend'), status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },
}));

appEvents.on('socket.open', () => void usePeopleYouMayKnow.getState().load());
onLogout(() => usePeopleYouMayKnow.setState({ people: [], status: 'idle' }));
