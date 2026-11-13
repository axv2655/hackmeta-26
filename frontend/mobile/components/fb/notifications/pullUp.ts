import { create } from 'zustand';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { onLogout } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { Notification } from '@/lib/types';

/** Notification types that get an inline "Pull up" pill (ARCHITECTURE.md 9.2). */
const PULL_UP_TYPES = new Set(['move_nudge', 'friend_pulling_up']);

export function canPullUp(n: Notification): boolean {
  return PULL_UP_TYPES.has(n.type) && Boolean(n.data?.move_id);
}

type PullUpState = 'joining' | 'joined';

type PullUpsStore = {
  /** By Move id. Missing = not pulled up from a notification this session. */
  byMove: Record<string, PullUpState>;
  pullUp: (moveId: string) => Promise<void>;
};

function without(map: Record<string, PullUpState>, key: string): Record<string, PullUpState> {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
}

/** One-tap join from a notification row: optimistic, rolls back with a toast on failure. */
export const usePullUps = create<PullUpsStore>()((set, get) => ({
  byMove: {},
  pullUp: async (moveId) => {
    if (get().byMove[moveId]) return;
    set((s) => ({ byMove: { ...s.byMove, [moveId]: 'joining' } }));
    try {
      await endpoints.moves.join(moveId);
      set((s) => ({ byMove: { ...s.byMove, [moveId]: 'joined' } }));
      appEvents.emit('moves.changed');
      toast("You're pulling up");
    } catch (e) {
      set((s) => ({ byMove: without(s.byMove, moveId) }));
      toast(errorMessage(e));
    }
  },
}));

onLogout(() => usePullUps.setState({ byMove: {} }));
