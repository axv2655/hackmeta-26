import { create } from 'zustand';

import { errorMessage } from './backend';
import { endpoints } from './endpoints';
import { onLogout } from './session';
import { toast } from './toast';
import type { Friend, Pending, Person, Relation, UserLite } from './types';

export type { Person, Relation } from './types';

/**
 * People and friend requests (backend `routes/friends.py`): requests, friends,
 * people you may know, and the actions on them.
 *
 * Actions are optimistic: a per-person override shows the new relation at
 * once. When the call returns, the override takes the relation the server
 * sent back. `load()` only drops an override when no action for that person
 * is in flight and the load started after the action finished, so a slow
 * load can never snap a button back. Failures roll back and show a toast.
 */

/** A row in your friend list: a Person plus how close you are. */
export type FriendPerson = Person & { tier: Friend['tier']; since: string };
export type FriendsStatus = 'idle' | 'loading' | 'ready' | 'error';

type FriendsState = {
  incoming: Person[];
  outgoing: Person[];
  friends: FriendPerson[];
  suggestions: Person[];
  /** Relation overrides from actions taken this session, by user id. */
  relations: Record<string, Relation>;
  /** True once the first load finished (ok or not). */
  loaded: boolean;
  status: FriendsStatus;
  error: string | null;
  suggestionsStatus: FriendsStatus;
  load: () => Promise<void>;
  loadSuggestions: () => Promise<void>;
  add: (user: UserLite, username?: string | null) => Promise<boolean>;
  confirm: (user: UserLite, username?: string | null) => Promise<boolean>;
  remove: (userId: string) => Promise<boolean>;
  unfriend: (userId: string) => Promise<boolean>;
  /** Hide my Moves from this person (block). Also ends the friendship. */
  hide: (userId: string) => Promise<boolean>;
  relationOf: (p: Pick<Person, 'user' | 'relation'>) => Relation;
};

export function searchPeople(q: string): Promise<Person[]> {
  return endpoints.friends.search(q);
}

/** "3 mutual friends", or null for none. */
export function mutualLabel(n: number | undefined): string | null {
  if (!n) return null;
  return `${n} mutual friend${n === 1 ? '' : 's'}`;
}

const toPending = (rows: Pending[], relation: Relation): Person[] =>
  rows.map((r) => ({ user: r.user, username: r.username, relation, mutual_count: r.mutual_count }));

const toFriend = (f: Friend): FriendPerson => ({
  user: f.user,
  username: f.username,
  relation: 'friend',
  mutual_count: 0,
  tier: f.tier,
  since: f.since,
});

/** The relation the loaded lists say, for anyone not in an override. */
function listRelation(s: Pick<FriendsState, 'incoming' | 'outgoing' | 'friends'>, id: string): Relation {
  if (s.friends.some((p) => p.user.id === id)) return 'friend';
  if (s.outgoing.some((p) => p.user.id === id)) return 'outgoing';
  if (s.incoming.some((p) => p.user.id === id)) return 'incoming';
  return 'none';
}

/** Current relation to `p`: override, then the loaded lists, then the row's own value. */
export function relationIn(s: FriendsState, p: Pick<Person, 'user' | 'relation'>): Relation {
  if (p.relation === 'self') return 'self';
  const override = s.relations[p.user.id];
  if (override) return override;
  const haveLists = s.status === 'ready' || s.friends.length + s.incoming.length + s.outgoing.length > 0;
  return s.loaded && haveLists ? listRelation(s, p.user.id) : p.relation;
}

// In-flight actions per user id, and the sequence number each last settled at.
let inFlight: Record<string, number> = {};
let settledAt: Record<string, number> = {};
let seq = 0;

const EMPTY = {
  incoming: [] as Person[],
  outgoing: [] as Person[],
  friends: [] as FriendPerson[],
  suggestions: [] as Person[],
  relations: {} as Record<string, Relation>,
  loaded: false,
  status: 'idle' as FriendsStatus,
  error: null as string | null,
  suggestionsStatus: 'idle' as FriendsStatus,
};

/** Overrides a load that started at `startSeq` may not drop. */
function keptOverrides(relations: Record<string, Relation>, startSeq: number): Record<string, Relation> {
  const kept: Record<string, Relation> = {};
  for (const [id, relation] of Object.entries(relations)) {
    if ((inFlight[id] ?? 0) > 0 || (settledAt[id] ?? 0) > startSeq) kept[id] = relation;
  }
  return kept;
}

export const useFriends = create<FriendsState>()((set, get) => {
  const setOverride = (id: string, relation: Relation | undefined) => {
    const next = { ...get().relations };
    if (relation) next[id] = relation;
    else delete next[id];
    set({ relations: next });
  };

  /** Show `optimistic` now, run `call`, then keep the server's answer or roll back. */
  const attempt = async (
    id: string,
    optimistic: Relation,
    call: () => Promise<{ relation: Relation } | null>,
  ): Promise<boolean> => {
    const before = get().relations[id];
    inFlight = { ...inFlight, [id]: (inFlight[id] ?? 0) + 1 };
    setOverride(id, optimistic);
    let ok = true;
    try {
      const res = await call();
      setOverride(id, res?.relation ?? optimistic);
    } catch (e) {
      ok = false;
      setOverride(id, before);
      toast(errorMessage(e));
    } finally {
      inFlight = { ...inFlight, [id]: Math.max(0, (inFlight[id] ?? 1) - 1) };
      settledAt = { ...settledAt, [id]: ++seq };
    }
    if (ok) void get().load();
    return ok;
  };

  return {
    ...EMPTY,
    load: async () => {
      const startSeq = seq;
      set({ status: get().loaded ? get().status : 'loading' });
      try {
        const [reqs, friends] = await Promise.all([endpoints.friends.requests(), endpoints.friends.list()]);
        set({
          incoming: toPending(reqs.incoming, 'incoming'),
          outgoing: toPending(reqs.outgoing, 'outgoing'),
          friends: friends.map(toFriend),
          relations: keptOverrides(get().relations, startSeq),
          loaded: true,
          status: 'ready',
          error: null,
        });
      } catch (e) {
        // Keep what we had; screens show ErrorState only when they have nothing.
        set({ loaded: true, status: 'error', error: errorMessage(e) });
      }
    },
    loadSuggestions: async () => {
      if (get().suggestionsStatus !== 'ready') set({ suggestionsStatus: 'loading' });
      try {
        const suggestions = await endpoints.friends.suggestions(10);
        set({ suggestions, suggestionsStatus: 'ready' });
      } catch {
        set({ suggestionsStatus: 'error' });
      }
    },
    add: (user) => attempt(user.id, 'outgoing', () => endpoints.friends.request(user.id)),
    confirm: (user) => attempt(user.id, 'friend', () => endpoints.friends.accept(user.id)),
    remove: (userId) => attempt(userId, 'none', () => endpoints.friends.drop(userId)),
    unfriend: (userId) => attempt(userId, 'none', () => endpoints.friends.unfriend(userId)),
    hide: (userId) =>
      attempt(userId, 'none', async () => {
        await endpoints.me.block(userId);
        set({ suggestions: get().suggestions.filter((p) => p.user.id !== userId) });
        return { relation: 'none' };
      }),
    relationOf: (p) => relationIn(get(), p),
  };
});

onLogout(() => {
  inFlight = {};
  settledAt = {};
  useFriends.setState({ ...EMPTY });
});
