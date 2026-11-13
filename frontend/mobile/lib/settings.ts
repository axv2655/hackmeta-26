import { create } from 'zustand';

import { errorMessage } from './backend';
import { endpoints } from './endpoints';
import { onLogout, useSession } from './session';
import { toast } from './toast';
import type { Friend, Me, Settings, SettingsPatch, UserLite } from './types';

/**
 * Settings and privacy (ARCHITECTURE.md 1.5, 12). `useSettings` holds `GET /me`
 * and saves each change through `PATCH /me/settings`, optimistically with a
 * rollback of just the keys that failed. `useHiddenFrom` is the block list,
 * `useAutojoin` the auto-join list, `useSettingsFriends` the friend picker.
 */

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

type SettingsState = {
  me: Me | null;
  status: LoadStatus;
  error: string | null;
  verifying: boolean;
  load: () => Promise<void>;
  /** Saves `p`. Resolves false (after rolling back and toasting) when it failed. */
  patch: (p: SettingsPatch) => Promise<boolean>;
  /** The mock "Verify with Facebook". */
  verify: () => Promise<boolean>;
};

/** Keeps the session's copy of `/me` in step so other screens read fresh settings. */
function syncSession(me: Me): void {
  if (useSession.getState().userId === me.user.id) useSession.setState({ me });
}

function withSettings(me: Me, settings: Settings): Me {
  return { ...me, settings };
}

function pickKeys(from: Settings, keys: (keyof Settings)[]): SettingsPatch {
  return Object.fromEntries(keys.map((k) => [k, from[k]])) as SettingsPatch;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  me: useSession.getState().me,
  status: useSession.getState().me ? 'ready' : 'idle',
  error: null,
  verifying: false,
  load: async () => {
    if (get().status === 'loading') return;
    const cached = get().me ?? useSession.getState().me;
    set({ me: cached, status: cached ? 'ready' : 'loading', error: null });
    try {
      const me = await endpoints.me.get();
      set({ me, status: 'ready', error: null });
      syncSession(me);
    } catch (e) {
      // Keep showing what we had; only an empty screen turns into an error.
      set(cached ? { status: 'ready' } : { status: 'error', error: errorMessage(e) });
      if (cached) toast(errorMessage(e));
    }
  },
  patch: async (p) => {
    const before = get().me;
    if (!before) return false;
    const keys = Object.keys(p) as (keyof Settings)[];
    const previous = pickKeys(before.settings, keys);
    set({ me: withSettings(before, { ...before.settings, ...p }) });
    try {
      const settings = await endpoints.me.settings(p);
      const current = get().me ?? before;
      const next = withSettings(current, { ...current.settings, ...pickKeys(settings, keys) });
      set({ me: next });
      syncSession(next);
      return true;
    } catch (e) {
      const current = get().me ?? before;
      set({ me: withSettings(current, { ...current.settings, ...previous }) });
      toast(errorMessage(e));
      return false;
    }
  },
  verify: async () => {
    if (get().verifying) return false;
    set({ verifying: true });
    try {
      const me = await endpoints.me.verify();
      set({ me, verifying: false });
      syncSession(me);
      void useSession.getState().refreshMe();
      return true;
    } catch (e) {
      set({ verifying: false });
      toast(errorMessage(e));
      return false;
    }
  },
}));

// --- people lists -------------------------------------------------------------

type PeopleState = {
  people: UserLite[];
  status: LoadStatus;
  error: string | null;
  load: () => Promise<void>;
};

async function loadPeople(
  get: () => PeopleState,
  set: (p: Partial<PeopleState>) => void,
  fetcher: () => Promise<UserLite[]>,
): Promise<void> {
  if (get().status === 'loading') return;
  const hadData = get().status === 'ready';
  set({ status: hadData ? 'ready' : 'loading', error: null });
  try {
    set({ people: await fetcher(), status: 'ready' });
  } catch (e) {
    if (hadData) toast(errorMessage(e));
    else set({ status: 'error', error: errorMessage(e) });
  }
}

type HiddenState = PeopleState & {
  hide: (user: UserLite) => Promise<boolean>;
  unhide: (user: UserLite) => Promise<boolean>;
};

/** People I hide my Moves from (`/me/blocks`). Hiding also ends the friendship. */
export const useHiddenFrom = create<HiddenState>()((set, get) => ({
  people: [],
  status: 'idle',
  error: null,
  load: () => loadPeople(get, set, endpoints.me.blocks),
  hide: async (user) => {
    if (get().people.some((p) => p.id === user.id)) return true;
    set({ people: [...get().people, user] });
    try {
      set({ people: await endpoints.me.block(user.id) });
      useSettingsFriends.getState().drop(user.id);
      useAutojoin.getState().forget(user.id);
      return true;
    } catch (e) {
      set({ people: get().people.filter((p) => p.id !== user.id) });
      toast(errorMessage(e));
      return false;
    }
  },
  unhide: async (user) => {
    const before = get().people;
    set({ people: before.filter((p) => p.id !== user.id) });
    try {
      await endpoints.me.unblock(user.id);
      return true;
    } catch (e) {
      const current = get().people;
      if (!current.some((p) => p.id === user.id)) set({ people: [...current, user] });
      toast(errorMessage(e));
      return false;
    }
  },
}));

type AutojoinState = PeopleState & {
  isOn: (userId: string) => boolean;
  toggle: (user: UserLite, on: boolean) => Promise<boolean>;
  /** Drops someone locally (the server already removed them, e.g. after hiding). */
  forget: (userId: string) => void;
};

/** Friends whose Moves I join without a prompt when we're together (`/me/autojoin`). */
export const useAutojoin = create<AutojoinState>()((set, get) => ({
  people: [],
  status: 'idle',
  error: null,
  load: () => loadPeople(get, set, endpoints.me.autojoin),
  isOn: (userId) => get().people.some((p) => p.id === userId),
  toggle: async (user, on) => {
    const without = get().people.filter((p) => p.id !== user.id);
    const next = on ? [...without, user] : without;
    set({ people: next });
    try {
      set({ people: await endpoints.me.setAutojoin(next.map((p) => p.id)) });
      return true;
    } catch (e) {
      const rest = get().people.filter((p) => p.id !== user.id);
      set({ people: on ? rest : [...rest, user] });
      toast(errorMessage(e));
      return false;
    }
  },
  forget: (userId) => set({ people: get().people.filter((p) => p.id !== userId) }),
}));

type FriendsListState = {
  friends: Friend[];
  status: LoadStatus;
  error: string | null;
  load: () => Promise<void>;
  drop: (userId: string) => void;
};

/** My friends, for the Hidden from picker and the Auto-join list. */
export const useSettingsFriends = create<FriendsListState>()((set, get) => ({
  friends: [],
  status: 'idle',
  error: null,
  load: async () => {
    if (get().status === 'loading') return;
    const hadData = get().status === 'ready';
    set({ status: hadData ? 'ready' : 'loading', error: null });
    try {
      const friends = await endpoints.friends.list();
      set({ friends: [...friends].sort((a, b) => a.user.name.localeCompare(b.user.name)), status: 'ready' });
    } catch (e) {
      if (hadData) toast(errorMessage(e));
      else set({ status: 'error', error: errorMessage(e) });
    }
  },
  drop: (userId) => set({ friends: get().friends.filter((f) => f.user.id !== userId) }),
}));

/** "10 PM", "12 AM", "8 AM". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? 'AM' : 'PM'}`;
}

export const DEFAULT_QUIET_HOURS = { start: 22, end: 8 } as const;

onLogout(() => {
  useSettings.setState({ me: null, status: 'idle', error: null, verifying: false });
  useHiddenFrom.setState({ people: [], status: 'idle', error: null });
  useAutojoin.setState({ people: [], status: 'idle', error: null });
  useSettingsFriends.setState({ friends: [], status: 'idle', error: null });
});
