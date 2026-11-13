import { create } from 'zustand';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { onLogout, useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { AcceptResult, Suggestion } from '@/lib/types';

/**
 * Pending Muse suggestions (Flares for calendar gaps, free time, revive a crew,
 * Reel Moves, "nobody bit"). Muse proposes; nothing here posts without the
 * user tapping Accept. Ride/route suggestions are left out (F22).
 */
export type SuggestionEdits = Parameters<typeof endpoints.suggestions.accept>[1];

type Status = 'idle' | 'loading' | 'ready' | 'error';

type SuggestionsState = {
  items: Suggestion[];
  status: Status;
  error: string | null;
  load: () => Promise<void>;
  get: (id: string) => Suggestion | undefined;
  /** The suggestion from the list, loading the list first if it is not there yet. Null when gone. */
  ensure: (id: string) => Promise<Suggestion | null>;
  accept: (id: string, edits?: SuggestionEdits) => Promise<AcceptResult>;
  dismiss: (id: string, neverAgain?: boolean) => Promise<void>;
};

const visible = (items: Suggestion[]): Suggestion[] => items.filter((s) => s.type !== 'route');

const without = (items: Suggestion[], id: string): Suggestion[] => items.filter((s) => s.id !== id);

/** Put a removed suggestion back where it was (rollback after a failed mutation). */
function restore(items: Suggestion[], removed: Suggestion, index: number): Suggestion[] {
  if (items.some((s) => s.id === removed.id)) return items;
  const at = Math.min(Math.max(index, 0), items.length);
  return [...items.slice(0, at), removed, ...items.slice(at)];
}

export const useSuggestions = create<SuggestionsState>()((set, get) => ({
  items: [],
  status: 'idle',
  error: null,
  load: async () => {
    if (!useSession.getState().userId) return;
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    try {
      const items = visible(await endpoints.suggestions.list());
      set({ items, status: 'ready', error: null });
    } catch (e) {
      set({ status: 'error', error: errorMessage(e) });
    }
  },
  get: (id) => get().items.find((s) => s.id === id),
  ensure: async (id) => {
    const found = get().get(id);
    if (found) return found;
    await get().load();
    return get().get(id) ?? null;
  },
  accept: async (id, edits) => {
    const before = get().items;
    const index = before.findIndex((s) => s.id === id);
    const removed = before[index];
    set({ items: without(before, id) });
    try {
      return await endpoints.suggestions.accept(id, edits);
    } catch (e) {
      if (removed) set((s) => ({ items: restore(s.items, removed, index) }));
      toast(errorMessage(e));
      throw e;
    }
  },
  dismiss: async (id, neverAgain) => {
    const before = get().items;
    const index = before.findIndex((s) => s.id === id);
    const removed = before[index];
    set({ items: without(before, id) });
    try {
      await endpoints.suggestions.dismiss(id, neverAgain);
    } catch (e) {
      if (removed) set((s) => ({ items: restore(s.items, removed, index) }));
      toast(errorMessage(e));
    }
  },
}));

appEvents.on('suggestion.created', () => void useSuggestions.getState().load());
appEvents.on('socket.open', () => void useSuggestions.getState().load());
onLogout(() => useSuggestions.setState({ items: [], status: 'idle', error: null }));
