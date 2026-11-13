/**
 * Wire types mirroring the backend schemas (IMPLEMENTATION_PLAN.md section A,
 * ARCHITECTURE.md 14). Timestamps are UTC ISO strings. `X | null` means the key
 * is always present. No user coordinates appear anywhere: only Marks carry
 * lat/lng.
 */

// --- shared -----------------------------------------------------------------

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

/** All categories, in display order. */
export const CATEGORIES: Category[] = [
  'food',
  'coffee',
  'study',
  'fitness',
  'nightlife',
  'outdoors',
  'games',
  'shopping',
  'errand',
  'other',
];

export type MuseSource = 'muse' | 'heuristic';

export type UserLite = {
  id: string;
  name: string;
  first_name: string;
  avatar_url: string;
  avatar_color: string;
  fb_verified: boolean;
};

export type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';

// --- Marks ------------------------------------------------------------------

/** MarkRead (core): /marks/*, Move.mark. */
export type Mark = {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address: string;
  photo_url: string | null;
  price_level: number | null;
  vibe_tags: string[];
  saved: boolean;
  score: number | null;
  friends_score: number | null;
};

/** MarkOut (muse): drafts, suggest-spots, ratings, leaderboards, reels. */
export type MuseMark = {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address: string;
  photo_url: string | null;
  vibe_tags: string[];
};

export type Ghost = { user: UserLite; move_id: string; at: string; text: string };
export type Memory = { move_id: string; mark_id: string; mark_name: string; category: Category; at: string; text: string };
export type NearbyMark = Mark & { distance_km: number; ghosts: Ghost[] };

export type MediaType = 'photo' | 'clip';

export type MarkMoment = {
  id: string;
  move_id: string;
  author: UserLite;
  media_url: string;
  media_type: MediaType;
  caption: string;
  created_at: string;
};

export type MarkDetail = Mark & {
  ghosts: Ghost[];
  moments: MarkMoment[];
  moves_count: number;
  top_ranker: { user: UserLite; score: number } | null;
};

export type MarkCreateBody = {
  name: string;
  category: Category;
  lat: number;
  lng: number;
  address?: string;
  vibe_tags?: string[];
};

// --- Moves ------------------------------------------------------------------

export type ParticipantStatus = 'going' | 'there' | 'left';
export type JoinedVia = 'creator' | 'tap' | 'ble_prompt' | 'ble_auto' | 'open_ble';

export type Participant = { user: UserLite; status: ParticipantStatus; joined_via: JoinedVia };

export type AudienceSummary = { count: number; circles: { id: string; name: string }[]; people: UserLite[] };

export type MoveKind = 'move' | 'flare';
export type MoveStatus = 'live' | 'ended' | 'cancelled';

export type Move = {
  id: string;
  creator: UserLite;
  mark: Mark;
  text: string;
  category: Category;
  status: MoveStatus;
  kind: MoveKind;
  open: boolean;
  starts_at: string;
  fill_deadline: string | null;
  ends_at: string | null;
  participants: Participant[];
  my_status: ParticipantStatus | null;
  moments_count: number;
  muse_reason: string | null;
  /** Creator only. */
  audience: AudienceSummary | null;
  /** Live Moves only, when the creator has enough history (else null). */
  tendency?: MoveTendency | null;
};

/** How long the creator's Moves usually last. `line`: "Tony's Kumo Moves usually last ~2h". */
export type MoveTendency = {
  line: string;
  typical_minutes: number;
  /** Which past Moves count: same Mark, same category, or all of them. */
  basis: 'mark' | 'category' | 'all';
  sample_size: number;
  source: 'muse' | 'heuristic';
};

export type MoveOrigin =
  | 'manual'
  | 'map'
  | 'reel'
  | 'saved_flare'
  | 'free_time'
  | 'revive'
  | 'glasses'
  | 'nobody_bit';

export type MoveCreateBody = {
  mark_id: string;
  text: string;
  category: Category;
  circle_ids: string[];
  user_ids: string[];
  kind: MoveKind;
  open: boolean;
  /** 5-10, required when kind is 'flare'. */
  fill_minutes: number | null;
  origin: MoveOrigin;
  origin_ref: string | null;
  creator_there: boolean;
  notify_user_ids: string[] | null;
};

export type Invite = {
  id: string;
  url: string;
  text: string;
  body: string;
  created_at: string;
  opened_at: string | null;
  open_count: number;
  guest_name: string | null;
  responded_at: string | null;
};

// --- Moments ----------------------------------------------------------------

export type MomentTag = { user: UserLite; approved: boolean | null };

export type Moment = {
  id: string;
  move_id: string;
  mark_id: string;
  author: UserLite;
  media_url: string;
  media_type: MediaType;
  caption: string;
  status: 'pending' | 'approved';
  created_at: string;
  tags: MomentTag[];
};

// --- Muse -------------------------------------------------------------------

export type NotifyPick = { user: UserLite; copy: string; reason: string; source: MuseSource };

export type MoveDraft = {
  mark: MuseMark | null;
  text: string;
  category: Category;
  kind: MoveKind;
  alternates: string[];
  circle_ids: string[];
  user_ids: string[];
  notify: NotifyPick[];
  fill_minutes: number | null;
  chips: string[];
  nearby_mark_ids: string[];
  confirm_place: boolean;
  source: MuseSource;
};

export type ComposeBody = {
  lat?: number;
  lng?: number;
  mark_id?: string;
  seed_text?: string;
  heuristic?: boolean;
};

export type NotifyPreviewBody = {
  mark_id: string;
  text: string;
  category?: Category;
  circle_ids: string[];
  user_ids: string[];
};

export type SuggestSpotsBody = { user_ids: string[]; category?: Category; lat?: number; lng?: number };

export type SpotPick = { mark: MuseMark; reason: string };

// Muse search: the map's prompt box (docs/MUSE_SEARCH.md).

export type MuseSearchRequest = {
  /** 1..300 chars. */
  text: string;
  /** Answers to an earlier `clarify` (name -> user id). */
  picks?: Record<string, string>;
  /** A place picked from an earlier card. */
  mark_id?: string | null;
  /** Coarse location (same rules as compose). */
  lat?: number;
  lng?: number;
};

export type MuseSearchKind = 'draft' | 'people' | 'places' | 'clarify' | 'answer';

export type MuseSearchDraft = {
  draft_id: string;
  text: string;
  place: string | null;
  /** Empty means your usual audience (Muse's picks). */
  recipients: string[];
  /** Who will see it; always shown (rule 4). */
  audience: string;
  expires_at: string | null;
};

export type MuseSearchPerson = {
  user_id: string;
  name: string;
  first_name: string;
  avatar_url: string;
  avatar_color: string;
  reason: string;
};

export type MuseSearchPlace = {
  mark_id: string;
  name: string;
  category: Category | string;
  /** Null when nobody in the group has rated it. */
  score: number | null;
  reason: string;
};

export type MuseSearchClarifyOption = {
  label: string;
  user_id: string | null;
  mark_id: string | null;
};

export type MuseSearchClarify = {
  /** "text": Muse couldn't tell what you meant; no options, answer by typing a reply. */
  field: 'person' | 'place' | 'text';
  /** The name being clarified (field == "person"); null otherwise. */
  name: string | null;
  question: string;
  options: MuseSearchClarifyOption[];
};

export type MuseSearchResult = {
  kind: MuseSearchKind;
  /** One line shown above the card. */
  message: string;
  source: MuseSource;
  /** The activity, reused by /muse/search/draft. */
  text: string;
  draft: MuseSearchDraft | null;
  people: MuseSearchPerson[];
  places: MuseSearchPlace[];
  clarify: MuseSearchClarify | null;
};

export type MuseSearchDraftBody = {
  text: string;
  /** At most 8. */
  user_ids: string[];
  mark_id?: string | null;
  lat?: number;
  lng?: number;
};

export type MuseSearchConfirm = { move_id: string; text: string };

export type MuseStatus = {
  client: 'http' | 'fake';
  live: boolean;
  model: string | null;
  vision: boolean;
  calls: number;
  muse_calls: number;
  fallbacks: number;
  fallback_rate: number;
  tokens_used: number;
  budget_tokens: number | null;
  budget_exhausted: boolean;
};

export type Taste = { summary: string; likes: string[]; dislikes: string[]; updated_at: string };

export type SuggestionType = 'flare' | 'free_time' | 'revive' | 'route' | 'reel_move' | 'nobody_bit';

export type Suggestion = {
  id: string;
  type: SuggestionType;
  message: string;
  chips: string[];
  draft: MoveDraft | null;
  status: 'pending' | 'accepted' | 'dismissed' | 'expired';
  created_at: string;
  expires_at: string;
  fill_minutes: number | null;
  target_move_id: string | null;
  group_id: string | null;
  window_start: string | null;
  window_end: string | null;
};

export type SuggestionEdits = { text?: string; user_ids?: string[]; fill_minutes?: number };

export type AcceptResult = { suggestion: Suggestion; move_id: string | null; draft: MoveDraft | null };

export type PseudoGroup = {
  id: string;
  label: string;
  members: UserLite[];
  pattern: Record<string, unknown[]>;
  strength: number;
  fading: boolean;
  last_hangout_at: string | null;
  /** 12 weeks, oldest first. */
  history: number[];
  muted: boolean;
};

// --- notifications ----------------------------------------------------------

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
};

// --- me, settings -----------------------------------------------------------

export type Settings = {
  location_opt_in: boolean;
  ble_opt_in: boolean;
  calendar_opt_in: boolean;
  open_moves_opt_in: boolean;
  muse_proactive: boolean;
  ghost_visible: boolean;
  default_circle_ids: string[];
  move_categories: Category[];
  quiet_hours: { start: number; end: number } | null;
};

export type SettingsPatch = Partial<Settings>;

export type Me = { user: UserLite & { home_area: string }; settings: Settings };

// --- friends ----------------------------------------------------------------

export type Friend = { user: UserLite; tier: 'close' | 'friend'; since: string; username: string | null };
export type Person = { user: UserLite; username: string | null; relation: Relation; mutual_count: number };
export type Pending = { user: UserLite; username: string | null; created_at: string; mutual_count: number };
export type FriendRequests = { incoming: Pending[]; outgoing: Pending[] };

export type ProfileMove = {
  id: string;
  text: string;
  category: Category;
  mark: { id: string; name: string };
  starts_at: string;
  my_status: ParticipantStatus | null;
};

export type Profile = {
  user: UserLite;
  username: string | null;
  relation: Relation;
  mutual_count: number;
  /** Up to 6. */
  mutual: UserLite[];
  friend_count: number;
  /** Live Moves the viewer can see. */
  moves: ProfileMove[];
};

// --- circles ----------------------------------------------------------------

export type Circle = { id: string; name: string; emoji: string; fb_group_name: string | null; members: UserLite[] };
export type CircleInput = { name: string; emoji?: string; fb_group_name?: string | null; member_ids?: string[] };

// --- saved ------------------------------------------------------------------

export type SavedMarkItem = {
  mark: Mark;
  source: 'map' | 'reel';
  source_ref: string | null;
  note: string;
  saved_at: string;
};

export type SavedReelItem = {
  id: string;
  author_name: string;
  thumb_url: string;
  video_url: string;
  caption: string;
  mark_id: string | null;
  saved_at: string;
};

export type SavedItems = { marks: SavedMarkItem[]; reels: SavedReelItem[] };

// --- ratings, leaderboards --------------------------------------------------

export type RatingFace = 'loved' | 'fine' | 'not_for_us';
export type RatingAnswer = { other_mark_id: string; preferred: 'this' | 'other' | 'same' };

export type RatingQuestions = {
  move_id: string;
  mark: MuseMark;
  category: Category;
  already_rated: boolean;
  faces: { key: RatingFace; label: string }[];
  vibe_tags: string[];
  ranked_count: number;
  first_comparison: MuseMark | null;
};

export type RatingNext = { next_comparison: MuseMark | null };

export type RatingSubmitBody = { face: RatingFace; answers: RatingAnswer[]; vibe_tags: string[]; note: string };

export type RatingResult = {
  mark: MuseMark;
  category: Category;
  /** 1-based. */
  position: number;
  total: number;
  score: number;
  /** Your top 10 in this category. */
  list: { mark: MuseMark; score: number; position: number }[];
  taste: Taste | null;
};

export type LeaderboardSpot = {
  position: number;
  mark: MuseMark;
  score: number;
  your_score: number | null;
  friends_score: number | null;
  /** Up to 3, highest score first. */
  rankers: UserLite[];
};

export type MyListRow = { position: number; mark: MuseMark; score: number; category: Category };

// --- calendar, reels --------------------------------------------------------

export type CalendarEvent = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
};
export type FreeWindow = { start: string; end: string; minutes: number };
export type CalendarDay = { events: CalendarEvent[]; free_window: FreeWindow | null };

export type Reel = {
  id: string;
  author_name: string;
  /** `bundle:<mock reel id>` for bundled media, else a remote URL. */
  video_url: string;
  thumb_url: string;
  caption: string;
  likes: number;
  mark: MuseMark | null;
  distance_mi: number | null;
  saved: boolean;
};

export type ReelActiveMove = {
  id: string;
  text: string;
  creator: UserLite;
  participants_count: number;
  friends_there: UserLite[];
  my_status: ParticipantStatus | null;
};

export type ReelPlace = {
  reel_id: string;
  mark: MuseMark | null;
  distance_mi: number | null;
  active_move: ReelActiveMove | null;
  headline: string;
  draft: MoveDraft | null;
  confirm_place: boolean;
};

// --- proximity --------------------------------------------------------------

export type ProximityAcceptResult = { move_id: string; status: 'there' };
export type BleToken = { token: string; uuid: string; expires_at: string };
export type BleSighting = { token: string; rssi: number };
export type BleSightingsResult = {
  accepted: number;
  together: number;
  arrived: string[];
  prompted: string[];
  auto_joined: string[];
};
export type CopresenceResult = { pairs: number; prompted: string[]; auto_joined: string[] };

/** Realtime `proximity.prompt` data. */
export type ProximityPromptEvent = {
  move_id: string;
  mark_name: string;
  creator: UserLite;
  names: string[];
  text: string;
};

// --- demo control -----------------------------------------------------------

export type DemoState = {
  demo_mode: 'on' | 'offline';
  now: string;
  offset_minutes: number;
  muse: Pick<MuseStatus, 'client' | 'live'>;
  user_id: string;
};

export type DemoTimeBody = { iso?: string; offset_minutes?: number; reset?: boolean };
export type DemoTimeResult = { now: string; offset_minutes: number };

export type DemoResetResult = {
  now: string;
  refreshed_moves: number;
  expired_suggestions: number;
  cleared_blocks: number;
};

export type DemoSuggestionResult = { suggestion: Suggestion | null; window?: FreeWindow | null };

export type DemoFriendMoveBody = {
  user_id: string;
  mark_id: string;
  text: string;
  category?: Category;
  notify_me?: boolean;
};
export type DemoFriendJoinBody = { user_id: string; move_id: string; status?: 'going' | 'there' };
export type DemoFriendLeaveBody = { user_id: string; move_id: string; quiet?: boolean };

export type DemoMuseStats = {
  calls: number;
  muse_calls: number;
  cache_hits: number;
  fallbacks: number;
  fallback_rate: number;
  client: string;
  by_agent: Record<string, Record<string, unknown>>;
  last_outputs: Record<string, unknown>[];
};

// --- realtime ---------------------------------------------------------------

export type Envelope = { type: string; data: unknown; ts: string };

/** Mirrors `McpTokenOut` in backend/app/api/routes/mcp_tokens.py. Never the token itself. */
export type McpToken = {
  id: string;
  label: string;
  /** "mvs_…abcd", enough to tell tokens apart. */
  hint: string;
  created_at: string;
  last_used_at: string | null;
};

/** Mirrors `IssuedTokenOut`: the user's one MCP token, shown once. */
export type IssuedMcpToken = McpToken & { user_id: string; token: string };
