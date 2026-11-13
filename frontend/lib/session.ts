import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { backendFetch, type BackendFetchOptions } from './backend';

/**
 * Who is signed in on this phone. Log in or sign up (`POST /auth/login`,
 * `/auth/signup`) and the account is saved on the device; its user id goes out
 * as `X-User-Id` on every request. Seeded demo people log in as their first
 * name ("tony") with the password "moves".
 */
export type UserLite = { id: string; name: string; first_name: string; avatar_url: string; avatar_color: string };

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
  logIn: (username: string, password: string) => Promise<void>;
  signUp: (name: string, username: string, password: string) => Promise<void>;
  logOut: () => void;
  loadUsers: () => Promise<void>;
};

const toAccount = ({ user, username }: AccountWire): Account => ({
  id: user.id,
  name: user.name,
  firstName: user.first_name,
  username,
});

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      account: null,
      userId: '',
      hydrated: false,
      users: [],
      logIn: async (username, password) => {
        const account = toAccount(await backendFetch<AccountWire>('/auth/login', postJson({ username, password })));
        set({ account, userId: account.id });
        void get().loadUsers();
      },
      signUp: async (name, username, password) => {
        const account = toAccount(
          await backendFetch<AccountWire>('/auth/signup', postJson({ name, username, password })),
        );
        set({ account, userId: account.id });
        void get().loadUsers();
      },
      logOut: () => set({ account: null, userId: '' }),
      loadUsers: async () => {
        try {
          set({ users: await backendFetch<UserLite[]>('/auth/users') });
        } catch {
          // Offline: names fall back to what the screens already have.
        }
      },
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
  const { account, userId, users } = useSession.getState();
  return account?.firstName ?? users.find((u) => u.id === userId)?.first_name ?? fallback;
}

/** `backendFetch` as the current user. */
export function api<T = unknown>(path: string, init: BackendFetchOptions = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-User-Id', useSession.getState().userId);
  return backendFetch<T>(path, { ...init, headers });
}

export function postJson(body: unknown): BackendFetchOptions {
  return { method: 'POST', body: JSON.stringify(body) };
}
