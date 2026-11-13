import { create } from 'zustand';

import { api, postJson, type UserLite } from './session';

/**
 * People and friend requests (backend `routes/friends.py`): search by name or
 * @username, add, confirm, delete, unfriend. Changes are optimistic and roll
 * back if the server says no. Realtime friend notifications call `load()`.
 */

export type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';
export type Person = { user: UserLite; username: string | null; relation: Relation };
type PendingWire = { user: UserLite; username: string | null; created_at: string };
type FriendWire = { user: UserLite };

export function searchPeople(q: string): Promise<Person[]> {
  return api<Person[]>(`/users/search?q=${encodeURIComponent(q)}`);
}

type FriendsState = {
  incoming: Person[];
  outgoing: Person[];
  friends: Person[];
  /** Relation overrides from actions taken this session, by user id. */
  relations: Record<string, Relation>;
  loaded: boolean;
  load: () => Promise<void>;
  add: (user: UserLite, username?: string | null) => Promise<void>;
  confirm: (user: UserLite, username?: string | null) => Promise<void>;
  remove: (userId: string) => Promise<void>;
  unfriend: (userId: string) => Promise<void>;
  relationOf: (p: Person) => Relation;
};

const pending = (rows: PendingWire[], relation: Relation): Person[] =>
  rows.map((r) => ({ user: r.user, username: r.username, relation }));

export const useFriends = create<FriendsState>()((set, get) => {
  /** Apply `relation` locally, run `call`, and roll back if it fails. */
  const attempt = async (userId: string, relation: Relation, call: () => Promise<unknown>) => {
    const before = get().relations;
    set({ relations: { ...before, [userId]: relation } });
    try {
      await call();
    } catch {
      set({ relations: before });
    } finally {
      void get().load();
    }
  };

  return {
    incoming: [],
    outgoing: [],
    friends: [],
    relations: {},
    loaded: false,
    load: async () => {
      try {
        const [reqs, friends] = await Promise.all([
          api<{ incoming: PendingWire[]; outgoing: PendingWire[] }>('/friends/requests'),
          api<FriendWire[]>('/friends'),
        ]);
        set({
          incoming: pending(reqs.incoming, 'incoming'),
          outgoing: pending(reqs.outgoing, 'outgoing'),
          friends: friends.map((f) => ({ user: f.user, username: null, relation: 'friend' })),
          relations: {},
          loaded: true,
        });
      } catch {
        set({ loaded: true }); // offline: keep what we had
      }
    },
    add: (user) => attempt(user.id, 'outgoing', () => api('/friends/requests', postJson({ user_id: user.id }))),
    confirm: (user) =>
      attempt(user.id, 'friend', () => api(`/friends/requests/${encodeURIComponent(user.id)}/accept`, { method: 'POST' })),
    remove: (userId) =>
      attempt(userId, 'none', () => api(`/friends/requests/${encodeURIComponent(userId)}`, { method: 'DELETE' })),
    unfriend: (userId) => attempt(userId, 'none', () => api(`/friends/${encodeURIComponent(userId)}`, { method: 'DELETE' })),
    relationOf: (p) => get().relations[p.user.id] ?? p.relation,
  };
});
