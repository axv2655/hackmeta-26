import { ApiError } from './backend';
import { mockAllowed } from './demo';
import { endpoints } from './endpoints';
import { coarse, here, kmBetween, useLocation } from './location';
import { friends as mockFriends } from './mock';
import { mapMoves, type MoveCategory } from './mock/moves';
import type { ComposerParams } from './nav';
import {
  CATEGORIES,
  type AudienceSummary,
  type Category,
  type Circle,
  type MarkDetail,
  type Move,
  type MoveDraft,
  type MoveOrigin,
  type MuseMark,
  type NearbyMark,
  type NotifyPick,
  type PseudoGroup,
  type SpotPick,
  type UserLite,
} from './types';

/**
 * Data and calls for "Make a Move" (ARCHITECTURE.md 7.2). Everything goes to
 * the backend. Only a network failure (or a demo build with no backend) may
 * fill the composer with bundled sample data, and then posting is off.
 */

/** The fields of a Mark the composer needs (both `Mark` and `MuseMark` fit). */
export type Place = Pick<MuseMark, 'id' | 'name' | 'category' | 'lat' | 'lng' | 'address'>;

/** Fill window for a Flare: off, 5 or 10 minutes. */
export type FillMinutes = 0 | 5 | 10;

export type Prefill = {
  markId?: string;
  text?: string;
  seedText?: string;
  category?: Category;
  circleIds: string[];
  userIds: string[];
  fill: FillMinutes;
  origin: MoveOrigin;
  originRef: string | null;
};

export type ComposerData = {
  /** True when this is bundled sample data (offline): nothing can be posted. */
  sample: boolean;
  /** The instant heuristic draft. */
  draft: MoveDraft;
  places: Place[];
  friends: UserLite[];
  circles: Circle[];
  /** Usual crews (Pseudo-groups) that are not muted. */
  crews: PseudoGroup[];
};

// --- params -------------------------------------------------------------------

const ORIGINS: MoveOrigin[] = ['manual', 'map', 'reel', 'saved_flare', 'free_time', 'revive', 'glasses', 'nobody_bit'];

type RawParams = { [K in keyof ComposerParams]?: string | string[] };

const first = (v?: string | string[]): string | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
};

const csv = (v?: string | string[]): string[] =>
  [...new Set((first(v) ?? '').split(',').map((s) => s.trim()).filter(Boolean))];

function parseFill(kind?: string, minutes?: string): FillMinutes {
  const n = Number(minutes);
  if (minutes && Number.isFinite(n) && n > 0) return n <= 7 ? 5 : 10;
  return kind === 'flare' ? 10 : 0;
}

/** `/move/new` params (lib/nav `ComposerParams`) as typed composer defaults. */
export function parsePrefill(p: RawParams): Prefill {
  const category = first(p.category);
  const origin = first(p.origin);
  return {
    markId: first(p.mark_id),
    text: first(p.text),
    seedText: first(p.seed_text),
    category: CATEGORIES.includes(category as Category) ? (category as Category) : undefined,
    circleIds: csv(p.circle_ids),
    userIds: csv(p.user_ids),
    fill: parseFill(first(p.kind), first(p.fill_minutes)),
    origin: ORIGINS.includes(origin as MoveOrigin) ? (origin as MoveOrigin) : 'manual',
    originRef: first(p.origin_ref) ?? null,
  };
}

// --- location -----------------------------------------------------------------

/** The phone's position rounded to ~100 m (the only form that leaves the phone). */
export function coarseHere(): { lat: number; lng: number } {
  const c = coarse(here());
  return { lat: c.latitude, lng: c.longitude };
}

/** True only with location on and the place within 150 m of the phone. */
export function isHere(place: Pick<Place, 'lat' | 'lng'>): boolean {
  const { permission, coords } = useLocation.getState();
  if (permission !== 'granted' || !coords) return false;
  return kmBetween(coords, { latitude: place.lat, longitude: place.lng }) < 0.15;
}

export const toPlace = (m: Place): Place => ({
  id: m.id,
  name: m.name,
  category: m.category,
  lat: m.lat,
  lng: m.lng,
  address: m.address,
});

/** `list` with `place` first (no duplicate). */
export function withPlaceFirst(list: Place[], place: Place): Place[] {
  return [toPlace(place), ...list.filter((p) => p.id !== place.id)];
}

// --- loading ------------------------------------------------------------------

function dedupe(list: Place[]): Place[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

async function getPlaces(ids: string[]): Promise<Place[]> {
  const rows = await Promise.all(ids.map((id) => endpoints.marks.get(id).catch(() => null)));
  return rows.filter((m): m is MarkDetail => m !== null).map(toPlace);
}

async function buildPlaces(draft: MoveDraft, nearby: NearbyMark[], markId?: string): Promise<Place[]> {
  let places = dedupe([...(draft.mark ? [toPlace(draft.mark)] : []), ...nearby.map(toPlace)]);
  // Far from every Mark (nearby is capped at 50 km): use the draft's nearest list.
  if (places.length <= 1 && draft.nearby_mark_ids.length) {
    places = dedupe([...places, ...(await getPlaces(draft.nearby_mark_ids.slice(0, 6)))]);
  }
  if (markId && !places.some((p) => p.id === markId)) {
    const [given] = await getPlaces([markId]);
    if (given) places = withPlaceFirst(places, given);
  }
  return places;
}

/** Seed for Muse's writer and place resolver: what the user (or a Reel) already said. */
export const seedOf = (p: Prefill): string | undefined => p.seedText ?? p.text;

async function loadLive(prefill: Prefill): Promise<ComposerData> {
  const at = coarseHere();
  const [draft, friendRows, circles, crews, nearby] = await Promise.all([
    endpoints.muse.compose({ ...at, mark_id: prefill.markId, seed_text: seedOf(prefill), heuristic: true }),
    endpoints.friends.list(),
    endpoints.circles.list(),
    endpoints.pseudoGroups.list().catch(() => [] as PseudoGroup[]),
    endpoints.marks.nearby(at.lat, at.lng, 50, 8).catch(() => [] as NearbyMark[]),
  ]);
  return {
    sample: false,
    draft,
    places: await buildPlaces(draft, nearby, prefill.markId),
    friends: friendRows.map((f) => f.user),
    circles,
    crews: crews.filter((c) => !c.muted && c.members.length > 0),
  };
}

/** True when `e` may be covered with sample data: a network failure (or demo build), never an HTTP error. */
export function sampleAllowed(e: unknown): boolean {
  return mockAllowed(e) && !(e instanceof ApiError && e.status > 0);
}

/** Loads the composer. HTTP errors throw (the screen shows Retry); offline gives sample data. */
export async function loadComposer(prefill: Prefill): Promise<ComposerData> {
  try {
    return await loadLive(prefill);
  } catch (e) {
    if (sampleAllowed(e)) return sampleComposer(prefill);
    throw e;
  }
}

/** Muse's real draft (no `heuristic` flag): writer, and the place resolver when no Mark is given. */
export function museDraft(prefill: Prefill): Promise<MoveDraft> {
  return endpoints.muse.compose({ ...coarseHere(), mark_id: prefill.markId, seed_text: seedOf(prefill) });
}

// --- sample data (offline only) ----------------------------------------------

const MOCK_CATEGORY: Record<MoveCategory, Category> = {
  coffee: 'coffee',
  study: 'study',
  gym: 'fitness',
  party: 'nightlife',
  music: 'other',
  food: 'food',
  shopping: 'shopping',
};

function sampleComposer(prefill: Prefill): ComposerData {
  const places = dedupe(
    mapMoves.map((m) => ({
      id: m.mark.id,
      name: m.mark.name,
      category: MOCK_CATEGORY[m.mark.category],
      lat: m.mark.coordinate.latitude,
      lng: m.mark.coordinate.longitude,
      address: m.mark.area,
    })),
  );
  const nearest = places[0];
  const draft: MoveDraft = {
    mark: nearest ? { ...nearest, photo_url: null, vibe_tags: [] } : null,
    text: prefill.text ?? (nearest ? `at ${nearest.name}, pull up` : ''),
    category: prefill.category ?? nearest?.category ?? 'other',
    kind: 'move',
    alternates: ['study sesh', 'grabbing food', 'just vibing'],
    circle_ids: [],
    user_ids: [],
    notify: [],
    fill_minutes: null,
    chips: [],
    nearby_mark_ids: places.map((p) => p.id),
    confirm_place: false,
    source: 'heuristic',
  };
  const friends: UserLite[] = mockFriends.map((u) => ({
    id: u.id,
    name: u.name,
    first_name: u.firstName,
    avatar_url: '',
    avatar_color: '',
    fb_verified: u.verified,
  }));
  return { sample: true, draft, places, friends, circles: [], crews: [] };
}

// --- calls --------------------------------------------------------------------

export const searchPlaces = (q: string): Promise<Place[]> =>
  endpoints.marks.search(q, 8).then((rows) => rows.map(toPlace));

/** Adds a new Mark at the phone's coarse position. */
export const addPlaceHere = (name: string, category: Category): Promise<Place> =>
  endpoints.marks.create({ name, category, ...coarseHere() }).then(toPlace);

export const museSpots = (userIds: string[], category: Category): Promise<SpotPick[]> =>
  endpoints.muse.suggestSpots({ user_ids: userIds, category, ...coarseHere() }).then((s) => s.slice(0, 3));

export const previewAudience = (circleIds: string[], userIds: string[]): Promise<AudienceSummary> =>
  endpoints.audience.preview(circleIds, userIds);

export type MoveInput = {
  place: Place;
  text: string;
  category: Category;
  circleIds: string[];
  userIds: string[];
  open: boolean;
  fill: FillMinutes;
  origin: MoveOrigin;
  originRef: string | null;
};

/** Posts the Move with nobody notified yet; the send step pokes people. */
export function postMove(input: MoveInput): Promise<Move> {
  return endpoints.moves.create({
    mark_id: input.place.id,
    text: input.text,
    category: input.category,
    circle_ids: input.circleIds,
    user_ids: input.userIds,
    kind: input.fill ? 'flare' : 'move',
    open: input.open,
    fill_minutes: input.fill || null,
    origin: input.origin,
    origin_ref: input.originRef,
    creator_there: isHere(input.place),
    notify_user_ids: [],
  });
}

/** Muse's picks for who to poke about a posted Move, each with a reason. */
export function previewPicks(move: Move, input: Pick<MoveInput, 'circleIds' | 'userIds'>): Promise<NotifyPick[]> {
  return endpoints.muse.notifyPreview({
    mark_id: move.mark.id,
    text: move.text,
    category: move.category,
    circle_ids: input.circleIds,
    user_ids: input.userIds,
  });
}

/** Pokes exactly `userIds`. Resolves to who actually got one. */
export const pokePeople = (moveId: string, userIds: string[]): Promise<NotifyPick[]> =>
  endpoints.moves.notify(moveId, userIds);
