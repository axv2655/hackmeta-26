import { backendFetch, type BackendFetchOptions } from './backend';
import { USER_ID } from './invites';
import { bitmojiPoseFor } from './mock/bitmoji';
import { currentUser, friends as mockFriends, users as mockUsers } from './mock';
import { mapMoves, myPosition, type MapMove, type MoveCategory } from './mock/moves';
import type { ImageRef } from './mock/types';

/**
 * Data for "Make a Move" (ARCHITECTURE.md 7.2): places, Muse's draft, groups
 * and friends to send to, posting, and the "notify them" step afterwards.
 *
 * Talks to the backend when it's reachable; otherwise everything works on the
 * mock world so the flow still demos offline (posting is local-only then).
 */

/** Backend Move categories (ports.Category). */
export type Category =
  | 'food'
  | 'coffee'
  | 'study'
  | 'fitness'
  | 'nightlife'
  | 'outdoors'
  | 'games'
  | 'shopping'
  | 'errand'
  | 'other';

export type Place = { id: string; name: string; category: Category; lat: number; lng: number; address: string };

export type Person = { id: string; name: string; firstName: string; avatar?: ImageRef; color?: string };

/** A Circle. `groupName` is set when it's a Facebook Group ("UTD Climbing"). */
export type Group = { id: string; name: string; groupName: string | null; memberIds: string[] };

export type ComposerData = {
  online: boolean;
  places: Place[];
  /** Index into `places` Muse thinks you're at. */
  placeIndex: number;
  text: string;
  /** One-tap alternatives for the description. */
  alternates: string[];
  groups: Group[];
  /** Muse's default groups for this kind of Move. */
  defaultGroupIds: string[];
  friends: Person[];
};

export type NotifyPick = { person: Person; copy: string; reason: string };

export type PostedMove = { id: string; online: boolean; place: Place; text: string; audience: Person[] };

const asUser = (init: BackendFetchOptions = {}): BackendFetchOptions => ({ ...init, headers: { 'X-User-Id': USER_ID } });
const post = (body: unknown) => asUser({ method: 'POST', body: JSON.stringify(body) });

// --- wire shapes (backend/app/models, app/muse/schemas.py) -----------------

type UserLite = { id: string; name: string; first_name: string; avatar_url: string; avatar_color: string };
type MarkWire = { id: string; name: string; category: Category; lat: number; lng: number; address: string };
type DraftWire = {
  mark: MarkWire | null;
  text: string;
  category: Category;
  alternates: string[];
  circle_ids: string[];
  nearby_mark_ids: string[];
};
type CircleWire = { id: string; name: string; fb_group_name: string | null; members: UserLite[] };
type PickWire = { user: UserLite; copy: string; reason: string };

/** Backend ids use `_`, the mock world `-`: reuse the bundled avatar when we can. */
function person(u: UserLite): Person {
  const mock = mockUsers.find((m) => m.id === u.id.replace(/_/g, '-'));
  return { id: u.id, name: u.name, firstName: u.first_name, avatar: mock?.avatar, color: u.avatar_color || undefined };
}

const place = (m: MarkWire): Place => ({
  id: m.id,
  name: m.name,
  category: m.category,
  lat: m.lat,
  lng: m.lng,
  address: m.address,
});

// --- loading ---------------------------------------------------------------

export async function loadComposer(): Promise<ComposerData> {
  try {
    const [draft, friendRows, circles] = await Promise.all([
      backendFetch<DraftWire>('/muse/compose-move', post({ lat: myPosition.latitude, lng: myPosition.longitude, heuristic: true })),
      backendFetch<{ user: UserLite }[]>('/friends', asUser()),
      backendFetch<CircleWire[]>('/circles', asUser()),
    ]);
    const ids = [...new Set([draft.mark?.id, ...draft.nearby_mark_ids].filter(Boolean) as string[])].slice(0, 8);
    const marks = await Promise.all(ids.map((id) => backendFetch<MarkWire>(`/marks/${id}`, asUser()).catch(() => null)));
    const places = marks.filter((m): m is MarkWire => m !== null).map(place);
    if (places.length === 0) throw new Error('no places');
    return {
      online: true,
      places,
      placeIndex: Math.max(0, places.findIndex((p) => p.id === draft.mark?.id)),
      text: draft.text,
      alternates: draft.alternates.slice(0, 3),
      groups: circles.map((c) => ({ id: c.id, name: c.name, groupName: c.fb_group_name, memberIds: c.members.map((m) => m.id) })),
      defaultGroupIds: draft.circle_ids,
      friends: friendRows.map((f) => person(f.user)),
    };
  } catch {
    return offlineComposer();
  }
}

const MOCK_CATEGORY: Record<MoveCategory, Category> = {
  coffee: 'coffee',
  study: 'study',
  gym: 'fitness',
  party: 'nightlife',
  music: 'other',
  food: 'food',
  shopping: 'shopping',
};

function offlineComposer(): ComposerData {
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const m of mapMoves) {
    if (seen.has(m.mark.id)) continue;
    seen.add(m.mark.id);
    places.push({
      id: m.mark.id,
      name: m.mark.name,
      category: MOCK_CATEGORY[m.mark.category],
      lat: m.mark.coordinate.latitude,
      lng: m.mark.coordinate.longitude,
      address: m.mark.area,
    });
  }
  places.sort((a, b) => km(a.lat, a.lng) - km(b.lat, b.lng));
  const friends = mockFriends.map((u) => ({ id: u.id, name: u.name, firstName: u.firstName, avatar: u.avatar }));
  const ids = (...first: string[]) => friends.filter((f) => first.includes(f.firstName)).map((f) => f.id);
  const nearest = places[0];
  return {
    online: false,
    places,
    placeIndex: 0,
    text: nearest ? `at ${nearest.name} rn, pull up` : '',
    alternates: ['study sesh', 'grabbing food', 'just vibing'],
    groups: [
      { id: 'g-climbing', name: 'Climbing', groupName: 'UTD Climbing', memberIds: ids('Tony', 'Maya', 'Dev') },
      { id: 'g-roommates', name: 'Roommates', groupName: null, memberIds: ids('Dhivyesh', 'Jordan') },
    ],
    defaultGroupIds: ['g-roommates'],
    friends,
  };
}

// --- posting and notifying -------------------------------------------------

export type MoveInput = { place: Place; text: string; groupIds: string[]; friendIds: string[]; audience: Person[] };

/** Posts the Move with nobody notified yet; step 2 sends the pokes. */
export async function postMove(input: MoveInput, online: boolean): Promise<PostedMove> {
  const base = { online, place: input.place, text: input.text, audience: input.audience };
  if (!online) return { ...base, id: `local-${Date.now()}` };
  const created = await backendFetch<{ id: string }>(
    '/moves',
    post({
      mark_id: input.place.id,
      text: input.text,
      category: input.place.category,
      circle_ids: input.groupIds,
      user_ids: input.friendIds,
      creator_there: km(input.place.lat, input.place.lng) < 0.15,
      notify_user_ids: [],
    }),
  );
  return { ...base, id: created.id };
}

/** Muse's picks for who to poke, each with a reason. */
export async function previewNotify(move: PostedMove, input: MoveInput): Promise<NotifyPick[]> {
  if (!move.online) {
    return input.audience.filter((p) => input.friendIds.includes(p.id)).map((p) => ({ person: p, copy: '', reason: 'you picked them' }));
  }
  const picks = await backendFetch<PickWire[]>(
    '/muse/notify-preview',
    post({ mark_id: input.place.id, text: input.text, category: input.place.category, circle_ids: input.groupIds, user_ids: input.friendIds }),
  );
  return picks.map((p) => ({ person: person(p.user), copy: p.copy, reason: p.reason }));
}

/** Sends the pokes. Resolves to who actually got one. */
export async function notifyPeople(move: PostedMove, userIds: string[]): Promise<Person[]> {
  if (!move.online) return move.audience.filter((p) => userIds.includes(p.id));
  const picks = await backendFetch<PickWire[]>(`/moves/${encodeURIComponent(move.id)}/notify`, post({ user_ids: userIds }));
  return picks.map((p) => person(p.user));
}

// --- map ---------------------------------------------------------------------

const MAP_CATEGORY: Record<Category, MoveCategory> = {
  food: 'food',
  coffee: 'coffee',
  study: 'study',
  fitness: 'gym',
  nightlife: 'party',
  outdoors: 'gym',
  games: 'party',
  shopping: 'shopping',
  errand: 'shopping',
  other: 'music',
};

/** The posted Move as a map pin and sheet row, for the poster's own map. */
export function toMapMove(move: PostedMove): MapMove {
  const category = MAP_CATEGORY[move.place.category];
  const there = km(move.place.lat, move.place.lng) < 0.15;
  return {
    id: move.id,
    user: currentUser,
    title: move.text,
    mark: {
      id: move.place.id,
      name: move.place.name,
      category,
      coordinate: { latitude: move.place.lat, longitude: move.place.lng },
      area: move.place.address.split(',').pop()?.trim() || 'Nearby',
    },
    status: there ? 'there' : 'omw',
    pose: bitmojiPoseFor(category),
    timeLabel: 'now',
    joined: [],
    distanceLabel: `${(km(move.place.lat, move.place.lng) * 0.621).toFixed(1)} mi`,
  };
}

/** Distance from the user's own (on-device) position, in km. */
function km(lat: number, lng: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat - myPosition.latitude) * rad;
  const dLng = (lng - myPosition.longitude) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(myPosition.latitude * rad) * Math.cos(lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Everyone a Move would reach: chosen groups' members plus chosen friends. */
export function audienceOf(data: ComposerData, groupIds: string[], friendIds: string[]): Person[] {
  const byId = new Map(data.friends.map((f) => [f.id, f]));
  const ids = new Set([...data.groups.filter((g) => groupIds.includes(g.id)).flatMap((g) => g.memberIds), ...friendIds]);
  ids.delete(USER_ID);
  ids.delete(currentUser.id);
  return [...ids].map((id) => byId.get(id) ?? { id, name: id, firstName: id.replace(/^u[_-]/, '') });
}
