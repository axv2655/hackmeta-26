import { create } from 'zustand';

import { backendFetch, type BackendFetchOptions } from './backend';

/**
 * Who this phone is acting as (mocked "Continue with Facebook", ARCHITECTURE.md
 * 3.1): a seeded backend user id sent as `X-User-Id` on every request. Two
 * demo phones pick different users from Menu > "Use the app as".
 */
export type UserLite = { id: string; name: string; first_name: string; avatar_url: string; avatar_color: string };

type SessionState = {
  userId: string;
  /** Seeded users from `GET /auth/users`, for the switcher and name lookups. */
  users: UserLite[];
  setUser: (id: string) => void;
  loadUsers: () => Promise<void>;
};

export const useSession = create<SessionState>()((set) => ({
  userId: process.env.EXPO_PUBLIC_USER_ID || 'u_anish',
  users: [],
  setUser: (id) => set({ userId: id }),
  loadUsers: async () => {
    try {
      set({ users: await backendFetch<UserLite[]>('/auth/users') });
    } catch {
      // Offline: the switcher just shows nobody; the app keeps working on mocks.
    }
  },
}));

/** The signed-in user's first name, from the seeded list when we have it. */
export function myFirstName(fallback: string): string {
  const { userId, users } = useSession.getState();
  return users.find((u) => u.id === userId)?.first_name ?? fallback;
}

/** `backendFetch` as the current user. */
export function api<T = unknown>(path: string, init: BackendFetchOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-User-Id', useSession.getState().userId);
  return backendFetch<T>(path, { ...init, headers });
}

export const postJson = (body: unknown): BackendFetchOptions => ({ method: 'POST', body: JSON.stringify(body) });
