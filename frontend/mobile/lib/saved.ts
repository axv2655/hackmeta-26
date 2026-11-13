import { create } from 'zustand';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { onLogout, useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { SavedItems } from '@/lib/types';

/**
 * Saved Marks (from the map or a Reel) and saved Reels (`GET /me/saved`).
 * `toggle` saves or unsaves a Mark optimistically and tells the other stores
 * through the `'saved.changed'` event.
 */
type Status = 'idle' | 'loading' | 'ready' | 'error';

type SavedState = {
  marks: SavedItems['marks'];
  reels: SavedItems['reels'];
  ids: Record<string, true>;
  loaded: boolean;
  status: Status;
  error: string | null;
  load: () => Promise<void>;
  isSaved: (markId: string) => boolean;
  toggle: (markId: string) => Promise<void>;
};

/** Marks this store's own events so its listener does not reload twice. */
const SELF = 'saved-store';

const idsOf = (marks: SavedItems['marks']): Record<string, true> =>
  Object.fromEntries(marks.map((m) => [m.mark.id, true as const]));

function withId(ids: Record<string, true>, id: string, saved: boolean): Record<string, true> {
  if (saved) return { ...ids, [id]: true };
  const { [id]: _drop, ...rest } = ids;
  return rest;
}

type SavedData = Pick<SavedState, 'marks' | 'reels' | 'ids' | 'loaded' | 'status' | 'error'>;

const empty = (): SavedData => ({ marks: [], reels: [], ids: {}, loaded: false, status: 'idle', error: null });

export const useSaved = create<SavedState>()((set, get) => ({
  ...empty(),
  load: async () => {
    if (!useSession.getState().userId) return;
    set((s) => ({ status: s.loaded ? 'ready' : 'loading', error: null }));
    try {
      const { marks, reels } = await endpoints.marks.saved();
      set({ marks, reels, ids: idsOf(marks), loaded: true, status: 'ready', error: null });
    } catch (e) {
      set({ status: 'error', error: errorMessage(e) });
    }
  },
  isSaved: (markId) => Boolean(get().ids[markId]),
  toggle: async (markId) => {
    const before = { marks: get().marks, ids: get().ids };
    const save = !before.ids[markId];
    set({
      ids: withId(before.ids, markId, save),
      marks: save ? before.marks : before.marks.filter((m) => m.mark.id !== markId),
    });
    try {
      await (save ? endpoints.marks.save(markId) : endpoints.marks.unsave(markId));
      appEvents.emit('saved.changed', { from: SELF, mark_id: markId, saved: save });
      void get().load();
    } catch (e) {
      set({ marks: before.marks, ids: before.ids });
      toast(errorMessage(e));
    }
  },
}));

appEvents.on('saved.changed', (data) => {
  const from = (data as { from?: unknown } | undefined)?.from;
  if (from !== SELF) void useSaved.getState().load();
});
onLogout(() => useSaved.setState(empty()));
