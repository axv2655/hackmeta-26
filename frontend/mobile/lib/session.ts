import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ApiError, backendFetch, type BackendFetchOptions } from './backend';
import { useConnectivity } from './connectivity';
import type { Me, UserLite } from './types';

export type { UserLite } from './types';

/**
 * Who is signed in on this phone. Log in or sign up (`POST /auth/login`,
 * `/auth/signup`) and the account is saved on the device; its user id goes out
 * as `X-User-Id` on every request. Seeded demo people log in as their first
 * name ("tony") with the password "moves".
 */
export type Account = { id: string; name: string; firstName: string; username: string };

type AccountWire = { user: UserLite; username: string };

type SessionState = {
  account: Account | null;
  /** The signed-in user's id, or '' when signed out. */
  userId: string;
  /** True once the saved account has been read from the device. */
  hydrated: boolean;
  /** Everyone from `GET /auth/users`, for name lookups. */
  users: UserLite[];
  /** `GET /me`, once loaded. */
  me: Me | null;
  /** Set by `signUp` (never persisted) so the shell can route to onboarding. */
  justSignedUp: boolean;
  logIn: (username: string, password: string) => Promise<void>;
  signUp: (name: string, username: string, password: string) => Promise<void>;
  logOut: () => void;
  loadUsers: () => Promise<void>;
  refreshMe: () => Promise<void>;
  clearJustSignedUp: () => void;
};

const toAccount = ({ user, username }: AccountWire): Account => ({
  id: user.id,
  name: user.name,
  firstName: user.first_name,
  username,
});

const logoutHandlers = new Set<() => void>();

/** Run `fn` on every log out (stores reset themselves). Returns an unsubscribe. */
export function onLogout(fn: () => void): () => void {
  logoutHandlers.add(fn);
  return () => {
    logoutHandlers.delete(fn);
  };
}

function runLogoutHandlers() {
  for (const fn of [...logoutHandlers]) {
    try {
      fn();
    } catch (e) {
      if (__DEV__) console.warn('onLogout handler threw', e);
    }
  }
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      account: null,
      userId: '',
      hydrated: false,
      users: [],
      me: null,
      justSignedUp: false,
      logIn: async (username, password) => {
        const account = toAccount(await backendFetch<AccountWire>('/auth/login', postJson({ username, password })));
        set({ account, userId: account.id, me: null, justSignedUp: false });
        void get().loadUsers();
        void get().refreshMe();
      },
      signUp: async (name, username, password) => {
        const account = toAccount(
          await backendFetch<AccountWire>('/auth/signup', postJson({ name, username, password })),
        );
        set({ account, userId: account.id, me: null, justSignedUp: true });
        void get().loadUsers();
        void get().refreshMe();
      },
      logOut: () => {
        runLogoutHandlers();
        set({ account: null, userId: '', me: null, justSignedUp: false });
      },
      loadUsers: async () => {
        try {
          set({ users: await backendFetch<UserLite[]>('/auth/users') });
        } catch {
          // Offline: names fall back to what the screens already have.
        }
      },
      refreshMe: async () => {
        if (!get().userId) return;
        try {
          set({ me: await api<Me>('/me') });
        } catch {
          // 401 already logged out inside api(); offline keeps what we had.
        }
      },
      clearJustSignedUp: () => set({ justSignedUp: false }),
    }),
    {
      name: 'moves-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ account: s.account, userId: s.userId }),
      onRehydrateStorage: () => () => useSession.setState({ hydrated: true }),
    },
  ),
);

/** The signed-in user's first name. */
export function myFirstName(fallback: string): string {
  const { account, userId, users, me } = useSession.getState();
  return me?.user.first_name ?? account?.firstName ?? users.find((u) => u.id === userId)?.first_name ?? fallback;
}

/** The signed-in user: `GET /me` once loaded, else the matching `/auth/users` row. */
export function useMe(): UserLite | null {
  return useSession((s) => s.me?.user ?? s.users.find((u) => u.id === s.userId) ?? null);
}

/**
 * `backendFetch` as the current user. Marks connectivity on every call, and a
 * 401 while signed in (the account no longer exists) logs out.
 */
export async function api<T = unknown>(path: string, init: BackendFetchOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const { userId } = useSession.getState();
  headers.set('X-User-Id', userId);
  try {
    const result = await backendFetch<T>(path, { ...init, headers });
    useConnectivity.getState().markOk();
    return result;
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      useConnectivity.getState().markOffline();
    } else {
      useConnectivity.getState().markOk();
      if (e instanceof ApiError && e.status === 401 && userId && useSession.getState().userId === userId) {
        useSession.getState().logOut();
      }
    }
    throw e;
  }
}

export function postJson(body?: unknown): BackendFetchOptions {
  return body === undefined ? { method: 'POST' } : { method: 'POST', body: JSON.stringify(body) };
}

export function putJson(body: unknown): BackendFetchOptions {
  return { method: 'PUT', body: JSON.stringify(body) };
}

export function patchJson(body: unknown): BackendFetchOptions {
  return { method: 'PATCH', body: JSON.stringify(body) };
}

export function del(): BackendFetchOptions {
  return { method: 'DELETE' };
}
