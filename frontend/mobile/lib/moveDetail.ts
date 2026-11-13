import { create } from 'zustand';

import { ApiError, errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { onLogout, useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { Move, Participant, ParticipantStatus, UserLite } from '@/lib/types';

/**
 * One Move at a time, by id, for the Move detail screen (`GET /moves/{id}`)
 * and every lifecycle action on it. Mutations change the Move on screen at
 * once, roll back with a toast when the server says no, then take the
 * server's Move and tell the other stores (`'moves.changed'`).
 */
export type DetailStatus = 'loading' | 'ready' | 'error' | 'missing';

type MoveDetailState = {
  byId: Record<string, Move>;
  status: Record<string, DetailStatus>;
  error: Record<string, string | null>;
  /** Ids with a mutation in flight, so buttons can't double-fire. */
  busy: Record<string, true>;
  load: (id: string) => Promise<void>;
  join: (id: string) => Promise<boolean>;
  /** Take back a Pull up while still on the way (no ghost). */
  withdraw: (id: string) => Promise<boolean>;
  arrive: (id: string) => Promise<boolean>;
  leave: (id: string, quiet: boolean) => Promise<boolean>;
  end: (id: string) => Promise<boolean>;
};

type Data = Pick<MoveDetailState, 'byId' | 'status' | 'error' | 'busy'>;

const empty = (): Data => ({ byId: {}, status: {}, error: {}, busy: {} });

const without = <T>(rec: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _drop, ...rest } = rec;
  return rest;
};

/** The Move with my participant row set to `status` (null removes it). */
function withMyStatus(move: Move, me: UserLite | null, status: ParticipantStatus | null): Move {
  if (!me) return { ...move, my_status: status };
  const others = move.participants.filter((p) => p.user.id !== me.id);
  const mine = move.participants.find((p) => p.user.id === me.id);
  const row: Participant | null = status ? { user: me, status, joined_via: mine?.joined_via ?? 'tap' } : null;
  return { ...move, my_status: status, participants: row ? [...others, row] : others };
}

function currentMe(): UserLite | null {
  const { me, users, userId } = useSession.getState();
  return me?.user ?? users.find((u) => u.id === userId) ?? null;
}

export const useMoveDetail = create<MoveDetailState>()((set, get) => {
  const put = (move: Move) => set((s) => ({ byId: { ...s.byId, [move.id]: move } }));

  /** Shared optimistic flow for every mutation. */
  async function mutate(id: string, optimistic: ((m: Move) => Move) | null, call: () => Promise<Move>) {
    if (get().busy[id]) return false;
    const before = get().byId[id];
    set((s) => ({ busy: { ...s.busy, [id]: true } }));
    if (before && optimistic) put(optimistic(before));
    try {
      put(await call());
      appEvents.emit('moves.changed', { move_id: id });
      return true;
    } catch (e) {
      if (before) put(before);
      toast(errorMessage(e));
      return false;
    } finally {
      set((s) => ({ busy: without(s.busy, id) }));
    }
  }

  return {
    ...empty(),
    load: async (id) => {
      const known = Boolean(get().byId[id]);
      if (!known) set((s) => ({ status: { ...s.status, [id]: 'loading' }, error: { ...s.error, [id]: null } }));
      try {
        const move = await endpoints.moves.get(id);
        set((s) => ({
          byId: { ...s.byId, [id]: move },
          status: { ...s.status, [id]: 'ready' },
          error: { ...s.error, [id]: null },
        }));
      } catch (e) {
        const gone = e instanceof ApiError && (e.status === 404 || e.status === 403);
        if (gone) {
          set((s) => ({ byId: without(s.byId, id), status: { ...s.status, [id]: 'missing' } }));
          return;
        }
        // A failed refresh keeps the Move we already show.
        if (known) return;
        set((s) => ({ status: { ...s.status, [id]: 'error' }, error: { ...s.error, [id]: errorMessage(e) } }));
      }
    },
    join: (id) => mutate(id, (m) => withMyStatus(m, currentMe(), 'going'), () => endpoints.moves.join(id)),
    withdraw: (id) => mutate(id, (m) => withMyStatus(m, currentMe(), null), () => endpoints.moves.leave(id)),
    arrive: (id) => mutate(id, (m) => withMyStatus(m, currentMe(), 'there'), () => endpoints.moves.arrive(id)),
    leave: (id, quiet) =>
      mutate(
        id,
        (m) => withMyStatus(m, currentMe(), quiet ? null : 'left'),
        () => endpoints.moves.leave(id, quiet),
      ),
    end: (id) => mutate(id, (m) => ({ ...m, status: 'ended' }), () => endpoints.moves.end(id)),
  };
});

function reloadFrom(data: unknown): void {
  const { byId, status, load } = useMoveDetail.getState();
  const moveId = (data as { move_id?: unknown } | undefined)?.move_id;
  if (typeof moveId === 'string') {
    if (byId[moveId] || status[moveId]) void load(moveId);
    return;
  }
  for (const id of Object.keys(byId)) void load(id);
}

for (const type of ['participant.changed', 'move.updated', 'move.ended', 'moment.added', 'socket.open']) {
  appEvents.on(type, reloadFrom);
}
onLogout(() => useMoveDetail.setState(empty()));
