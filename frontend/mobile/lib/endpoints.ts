import { coarse } from './location';
import { api, del, patchJson, postJson, putJson } from './session';
import type {
  AcceptResult,
  AudienceSummary,
  CalendarDay,
  Category,
  Circle,
  CircleInput,
  ComposeBody,
  CopresenceResult,
  DemoFriendJoinBody,
  DemoFriendLeaveBody,
  DemoFriendMoveBody,
  DemoMuseStats,
  DemoResetResult,
  DemoState,
  DemoSuggestionResult,
  DemoTimeBody,
  DemoTimeResult,
  Friend,
  FriendRequests,
  Invite,
  LeaderboardSpot,
  Mark,
  MarkCreateBody,
  MarkDetail,
  Me,
  Memory,
  Moment,
  Move,
  MoveCreateBody,
  MoveDraft,
  MuseStatus,
  MyListRow,
  NearbyMark,
  Notification,
  NotifyPick,
  NotifyPreviewBody,
  Person,
  Profile,
  ProximityAcceptResult,
  PseudoGroup,
  RatingAnswer,
  RatingNext,
  RatingQuestions,
  RatingResult,
  RatingSubmitBody,
  Reel,
  ReelPlace,
  Relation,
  SavedItems,
  Settings,
  SettingsPatch,
  SpotPick,
  SuggestSpotsBody,
  Suggestion,
  SuggestionEdits,
  Taste,
  UserLite,
} from './types';

/**
 * One typed function per backend endpoint (IMPLEMENTATION_PLAN.md section A),
 * all through `api()` (X-User-Id, connectivity, 401 log out). Any coordinate
 * leaving the phone is rounded by `coarse()` first.
 */

export type LatLng = { lat: number; lng: number };

const e = encodeURIComponent;

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${e(k)}=${e(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function near(lat: number, lng: number): LatLng {
  const c = coarse({ latitude: lat, longitude: lng });
  return { lat: c.latitude, lng: c.longitude };
}

function nearOpt(at?: LatLng): Partial<LatLng> {
  return at ? near(at.lat, at.lng) : {};
}

/** Coarsens `lat`/`lng` inside a body when both are present. */
function withCoarse<T extends { lat?: number; lng?: number }>(body: T): T {
  if (body.lat === undefined || body.lng === undefined) return body;
  return { ...body, ...near(body.lat, body.lng) };
}

const moves = {
  nearby: (lat: number, lng: number, radiusKm?: number) =>
    api<Move[]>(`/moves/nearby${qs({ ...near(lat, lng), radius_km: radiusKm })}`),
  feed: () => api<Move[]>('/moves/feed'),
  get: (id: string) => api<Move>(`/moves/${e(id)}`),
  create: (body: MoveCreateBody) => api<Move>('/moves', postJson(body)),
  join: (id: string) => api<Move>(`/moves/${e(id)}/join`, postJson()),
  arrive: (id: string) => api<Move>(`/moves/${e(id)}/arrive`, postJson()),
  leave: (id: string, quiet?: boolean) =>
    api<Move>(`/moves/${e(id)}/leave`, postJson(quiet === undefined ? undefined : { quiet })),
  end: (id: string) => api<Move>(`/moves/${e(id)}/end`, postJson()),
  notify: (id: string, userIds: string[]) => api<NotifyPick[]>(`/moves/${e(id)}/notify`, postJson({ user_ids: userIds })),
  invites: (id: string) => api<Invite[]>(`/moves/${e(id)}/invites`),
  createInvite: (id: string, message?: string) =>
    api<Invite>(`/moves/${e(id)}/invites`, postJson(message ? { message } : {})),
};

const marks = {
  nearby: (lat: number, lng: number, radiusKm?: number, limit?: number) =>
    api<NearbyMark[]>(`/marks/nearby${qs({ ...near(lat, lng), radius_km: radiusKm, limit })}`),
  search: (q: string, limit?: number) => api<Mark[]>(`/marks/search${qs({ q, limit })}`),
  create: (body: MarkCreateBody) => api<Mark>('/marks', postJson(withCoarse(body))),
  get: (id: string) => api<MarkDetail>(`/marks/${e(id)}`),
  save: (id: string) => api<null>(`/marks/${e(id)}/save`, postJson()),
  unsave: (id: string) => api<null>(`/marks/${e(id)}/save`, del()),
  saved: () => api<SavedItems>('/me/saved'),
};

const moments = {
  list: (moveId: string) => api<Moment[]>(`/moves/${e(moveId)}/moments`),
  approve: (id: string, approve: boolean) => api<Moment>(`/moments/${e(id)}/approve`, postJson({ approve })),
};

const muse = {
  status: () => api<MuseStatus>('/muse/status'),
  compose: (body: ComposeBody) => api<MoveDraft>('/muse/compose-move', postJson(withCoarse(body))),
  notifyPreview: (body: NotifyPreviewBody) => api<NotifyPick[]>('/muse/notify-preview', postJson(body)),
  suggestSpots: (body: SuggestSpotsBody) => api<SpotPick[]>('/muse/suggest-spots', postJson(withCoarse(body))),
  taste: () => api<Taste | null>('/me/taste'),
};

const suggestions = {
  list: () => api<Suggestion[]>('/suggestions'),
  accept: (id: string, edits?: SuggestionEdits) =>
    api<AcceptResult>(`/suggestions/${e(id)}/accept`, postJson(edits ?? {})),
  dismiss: (id: string, neverAgain?: boolean) =>
    api<Suggestion>(`/suggestions/${e(id)}/dismiss`, postJson(neverAgain ? { never_again: true } : {})),
};

const pseudoGroups = {
  list: () => api<PseudoGroup[]>('/pseudo-groups'),
  revive: (id: string) => api<MoveDraft>(`/pseudo-groups/${e(id)}/revive`, postJson()),
  mute: (id: string) => api<null>(`/pseudo-groups/${e(id)}/mute`, postJson()),
  unmute: (id: string) => api<null>(`/pseudo-groups/${e(id)}/mute`, del()),
};

const notifications = {
  list: (unreadOnly?: boolean) => api<Notification[]>(`/notifications${qs({ unread_only: unreadOnly || undefined })}`),
  read: (ids?: string[]) => api<{ updated: number }>('/notifications/read', postJson(ids ? { ids } : {})),
};

const me = {
  get: () => api<Me>('/me'),
  update: (name: string) => api<Me>('/me', patchJson({ name })),
  verify: () => api<Me>('/me/verify', postJson()),
  settings: (patch: SettingsPatch) => api<Settings>('/me/settings', patchJson(patch)),
  blocks: () => api<UserLite[]>('/me/blocks'),
  /** Resolves to the caller's whole block list after the change. */
  block: (userId: string) => api<UserLite[]>('/me/blocks', postJson({ user_id: userId })),
  unblock: (userId: string) => api<null>(`/me/blocks/${e(userId)}`, del()),
  autojoin: () => api<UserLite[]>('/me/autojoin'),
  setAutojoin: (ids: string[]) => api<UserLite[]>('/me/autojoin', putJson({ user_ids: ids })),
};

type RelationResult = { relation: Relation };

const friends = {
  list: () => api<Friend[]>('/friends'),
  requests: () => api<FriendRequests>('/friends/requests'),
  request: (id: string) => api<RelationResult>('/friends/requests', postJson({ user_id: id })),
  accept: (id: string) => api<RelationResult>(`/friends/requests/${e(id)}/accept`, postJson()),
  /** Decline an incoming request or cancel an outgoing one. */
  drop: (id: string) => api<null>(`/friends/requests/${e(id)}`, del()),
  unfriend: (id: string) => api<null>(`/friends/${e(id)}`, del()),
  search: (q: string) => api<Person[]>(`/users/search${qs({ q })}`),
  suggestions: (limit?: number) => api<Person[]>(`/friends/suggestions${qs({ limit })}`),
  profile: (id: string) => api<Profile>(`/users/${e(id)}`),
};

const circles = {
  list: () => api<Circle[]>('/circles'),
  create: (body: CircleInput) => api<Circle>('/circles', postJson(body)),
  update: (id: string, body: Partial<CircleInput>) => api<Circle>(`/circles/${e(id)}`, patchJson(body)),
  remove: (id: string) => api<null>(`/circles/${e(id)}`, del()),
};

const audience = {
  preview: (circleIds: string[], userIds: string[]) =>
    api<AudienceSummary>('/audience/preview', postJson({ circle_ids: circleIds, user_ids: userIds })),
};

const ratings = {
  questions: (moveId: string) => api<RatingQuestions>(`/moves/${e(moveId)}/rating/questions`),
  next: (moveId: string, answers: RatingAnswer[]) =>
    api<RatingNext>(`/moves/${e(moveId)}/rating/next`, postJson({ answers })),
  submit: (moveId: string, body: RatingSubmitBody) => api<RatingResult>(`/moves/${e(moveId)}/rating`, postJson(body)),
};

const leaderboards = {
  spots: (category?: Category, limit?: number) => api<LeaderboardSpot[]>(`/leaderboards/spots${qs({ category, limit })}`),
  myList: (category?: Category) => api<MyListRow[]>(`/leaderboards/my-list${qs({ category })}`),
};

const calendar = {
  get: () => api<CalendarDay>('/calendar'),
};

const reels = {
  list: (at?: LatLng) => api<Reel[]>(`/reels${qs(nearOpt(at))}`),
  place: (id: string, at?: LatLng) => api<ReelPlace>(`/reels/${e(id)}/place${qs(nearOpt(at))}`),
  save: (id: string) => api<null>(`/reels/${e(id)}/save`, postJson()),
  unsave: (id: string) => api<null>(`/reels/${e(id)}/save`, del()),
};

const proximity = {
  accept: (moveId: string, always?: boolean) =>
    api<ProximityAcceptResult>(`/proximity/prompt/${e(moveId)}/accept`, postJson(always ? { always: true } : {})),
};

type UserBody = { user_id?: string };

const demo = {
  state: () => api<DemoState>('/demo/state'),
  time: (body: DemoTimeBody) => api<DemoTimeResult>('/demo/time', postJson(body)),
  reset: () => api<DemoResetResult>('/demo/reset', postJson()),
  flareScan: (body?: UserBody & { window_minutes?: number }) =>
    api<DemoSuggestionResult>('/demo/flare-scan', postJson(body ?? {})),
  freeTime: (body?: UserBody) => api<DemoSuggestionResult>('/demo/free-time', postJson(body ?? {})),
  reviveScan: (body?: UserBody) => api<DemoSuggestionResult>('/demo/revive-scan', postJson(body ?? {})),
  friendMove: (body: DemoFriendMoveBody) => api<{ move_id: string }>('/demo/friend-move', postJson(body)),
  friendJoin: (body: DemoFriendJoinBody) =>
    api<{ move_id: string; status: string }>('/demo/friend-join', postJson(body)),
  friendLeave: (body: DemoFriendLeaveBody) =>
    api<{ move_id: string; my_status: string | null }>('/demo/friend-leave', postJson(body)),
  friendAccept: (userId: string) => api<RelationResult>('/demo/friend-accept', postJson({ user_id: userId })),
  endMove: (moveId: string) => api<{ move_id: string; status: 'ended' }>('/demo/end-move', postJson({ move_id: moveId })),
  nobodyBit: (moveId: string) => api<DemoSuggestionResult>('/demo/nobody-bit', postJson({ move_id: moveId })),
  copresence: (userIds: string[], on: boolean) =>
    api<CopresenceResult>('/demo/copresence', postJson({ user_ids: userIds, on })),
  museStats: () => api<DemoMuseStats>('/demo/muse-stats'),
  users: () => api<UserLite[]>('/auth/users'),
};

export const endpoints = {
  memories: { list: (limit = 30, offset = 0) => api<Memory[]>(`/me/memories?limit=${limit}&offset=${offset}`) },
  moves,
  marks,
  moments,
  muse,
  suggestions,
  pseudoGroups,
  notifications,
  me,
  friends,
  circles,
  audience,
  ratings,
  leaderboards,
  calendar,
  reels,
  proximity,
  demo,
};
