import { create } from 'zustand';

import { errorMessage } from './backend';
import { endpoints } from './endpoints';
import { appEvents } from './events';
import { onLogout, useSession } from './session';
import type { Memory } from './types';

const PAGE_SIZE = 30;
type State = {
  items: Memory[]; status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null; hasMore: boolean;
  load: (more?: boolean) => Promise<void>;
};
const empty = { items: [] as Memory[], status: 'idle' as const, error: null, hasMore: false };
let generation = 0;

export const useMemories = create<State>()((set, get) => ({
  ...empty,
  load: async (more = false) => {
    const userId = useSession.getState().userId;
    if (!userId || (more && get().status === 'loading')) return;
    const request = ++generation;
    const previous = more ? get().items : [];
    set({ status: 'loading', error: null });
    try {
      const rows = await endpoints.memories.list(PAGE_SIZE, previous.length);
      if (request !== generation || userId !== useSession.getState().userId) return;
      const seen = new Set(previous.map((m) => m.move_id));
      set({ items: [...previous, ...rows.filter((m) => !seen.has(m.move_id))],
        status: 'ready', hasMore: rows.length === PAGE_SIZE });
    } catch (e) {
      if (request === generation && userId === useSession.getState().userId) {
        set({ status: 'error', error: errorMessage(e) });
      }
    }
  },
}));

// A visit becomes a Memory the moment you leave or the Move ends.
for (const event of ['moves.changed', 'move.ended', 'participant.changed']) {
  appEvents.on(event, () => {
    const store = useMemories.getState();
    if (store.status !== 'idle') void store.load();
  });
}
onLogout(() => { generation++; useMemories.setState(empty); });
