import { create } from 'zustand';

import { ApiError, errorMessage } from './backend';
import { endpoints } from './endpoints';
import { onLogout } from './session';
import { toast } from './toast';
import type { Circle, CircleInput, UserLite } from './types';

/**
 * Your Circles (`/circles`): who sees a Move in one tap. Every change is
 * optimistic and rolls back with a toast when the server says no.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';

type CirclesState = {
  items: Circle[];
  status: Status;
  error: string | null;
  load: () => Promise<void>;
  /** Resolves to the saved Circle, or null when it failed (a toast already said why). */
  create: (input: CircleInput, members?: UserLite[]) => Promise<Circle | null>;
  update: (id: string, patch: Partial<CircleInput>, members?: UserLite[]) => Promise<Circle | null>;
  remove: (id: string) => Promise<boolean>;
  get: (id: string) => Circle | undefined;
};

/** Readable text for a failed Circle write. */
export function circleError(e: unknown): string {
  if (e instanceof ApiError && e.status === 422 && /friend/i.test(e.detail)) return 'Only friends can be in a Circle';
  return errorMessage(e);
}

let tempSeq = 0;

function draftCircle(input: CircleInput, members: UserLite[]): Circle {
  tempSeq += 1;
  return {
    id: `tmp_${tempSeq}`,
    name: input.name.trim(),
    emoji: input.emoji ?? '',
    fb_group_name: input.fb_group_name ?? null,
    members,
  };
}

function patched(c: Circle, patch: Partial<CircleInput>, members?: UserLite[]): Circle {
  return {
    ...c,
    name: patch.name !== undefined ? patch.name.trim() : c.name,
    emoji: patch.emoji !== undefined ? patch.emoji : c.emoji,
    fb_group_name: patch.fb_group_name !== undefined ? patch.fb_group_name : c.fb_group_name,
    members: members ?? c.members,
  };
}

export const useCircles = create<CirclesState>()((set, get) => ({
  items: [],
  status: 'idle',
  error: null,
  load: async () => {
    if (get().status !== 'ready') set({ status: 'loading', error: null });
    try {
      set({ items: await endpoints.circles.list(), status: 'ready', error: null });
    } catch (e) {
      // Keep what we had when a refresh fails; only an empty first load shows the error.
      if (get().items.length) {
        set({ status: 'ready' });
        toast(errorMessage(e));
      } else {
        set({ status: 'error', error: errorMessage(e) });
      }
    }
  },
  create: async (input, members = []) => {
    const temp = draftCircle(input, members);
    set({ items: [...get().items, temp] });
    try {
      const saved = await endpoints.circles.create(input);
      set({ items: get().items.map((c) => (c.id === temp.id ? saved : c)) });
      return saved;
    } catch (e) {
      set({ items: get().items.filter((c) => c.id !== temp.id) });
      toast(circleError(e));
      return null;
    }
  },
  update: async (id, patch, members) => {
    const before = get().items;
    set({ items: before.map((c) => (c.id === id ? patched(c, patch, members) : c)) });
    try {
      const saved = await endpoints.circles.update(id, patch);
      set({ items: get().items.map((c) => (c.id === id ? saved : c)) });
      return saved;
    } catch (e) {
      set({ items: before });
      toast(circleError(e));
      return null;
    }
  },
  remove: async (id) => {
    const before = get().items;
    set({ items: before.filter((c) => c.id !== id) });
    try {
      await endpoints.circles.remove(id);
      return true;
    } catch (e) {
      set({ items: before });
      toast(circleError(e));
      return false;
    }
  },
  get: (id) => get().items.find((c) => c.id === id),
}));

onLogout(() => useCircles.setState({ items: [], status: 'idle', error: null }));
