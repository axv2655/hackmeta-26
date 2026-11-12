import type { IconName } from '@/components/ui/Icon';

/**
 * A bundled image: the value returned by `require('...jpg')`.
 * Pass it straight to expo-image: `<Image source={ref} />`.
 */
export type ImageRef = number;

export type UserKind = 'person' | 'page' | 'group';

export type User = {
  id: string;
  kind: UserKind;
  /** Full display name: "Tony Nguyen", "Kumo Matcha". */
  name: string;
  /** First name for people; short name for pages and groups. */
  firstName: string;
  avatar: ImageRef;
  /** Blue check next to the name. */
  verified: boolean;
  /** Mutual friends with the current user (0 for pages/groups and for yourself). */
  mutualFriends: number;
  /** Already a friend of the current user (people only). */
  isFriend: boolean;
  /** Green dot on the avatar. */
  online: boolean;
  /** One-line descriptor: "Computer Science at UT Dallas", "Cafe · Richardson, Texas". */
  subtitle: string;
  /** Pages: follower count. Groups: member count. */
  audienceCount?: number;
};

export type Audience = 'public' | 'friends' | 'group' | 'only-me';

export type ReactionKind = 'like' | 'love';

export type LinkPreview = {
  /** Shown uppercase: "RICHARDSON NOW". */
  source: string;
  /** Shown uppercase after a middle dot: "2-MIN READ". */
  readTime: string;
  title: string;
};

export type LifeEventKind = 'relationship' | 'job' | 'school' | 'moved';

export type LifeEvent = {
  kind: LifeEventKind;
  /** Big centered line: "In a relationship". */
  title: string;
  /** Gray line under it: "Today". */
  subtitle: string;
};

export type PostKind = 'text' | 'photo' | 'life-event' | 'link' | 'group';

export type Post = {
  type: 'post';
  id: string;
  kind: PostKind;
  author: User;
  /** Set for `kind: 'group'`: the group the author posted in. */
  group?: User;
  /** Relative time already formatted the Facebook way: "4 m", "3 h", "2 d". */
  timeLabel: string;
  audience: Audience;
  text?: string;
  image?: ImageRef;
  /** width / height of `image`. Bundled post photos are 4:3. */
  imageAspect?: number;
  /** Set for `kind: 'link'`: gray footer under the image. */
  link?: LinkPreview;
  /** Set for `kind: 'life-event'`. */
  lifeEvent?: LifeEvent;
  /** Optional check-in shown as "is at <placeName>" next to the author name. */
  placeName?: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  /** Whether the current user has liked it. `likeCount` already includes that like. */
  liked: boolean;
  /** Reaction badges shown left of the like count, in order. */
  reactions: ReactionKind[];
  /** Show the X (hide post) button next to "...". True for page / suggested posts. */
  dismissible: boolean;
};

/** Marker: render the horizontal "Reels and short videos" unit here. */
export type ReelsUnit = {
  type: 'reels-unit';
  id: string;
  title: string;
};

/** Marker: render the "People you may know" carousel here. */
export type PeopleYouMayKnowUnit = {
  type: 'pymk';
  id: string;
  title: string;
};

/** One row of the home feed. Discriminate on `type`. */
export type FeedItem = Post | ReelsUnit | PeopleYouMayKnowUnit;

/** What the composer hands to `useFeedStore().addPost`. */
export type PostDraft = {
  text: string;
  image?: ImageRef;
  imageAspect?: number;
  audience?: Audience;
  placeName?: string;
};

export type Story = {
  id: string;
  user: User;
  image: ImageRef;
  /** Seen stories get a gray ring instead of a blue one. */
  seen: boolean;
  timeLabel: string;
};

export type Reel = {
  id: string;
  author: User;
  /** 9:16 poster frame (there is no real video). */
  poster: ImageRef;
  caption: string;
  /** "Original audio · Tony Nguyen". */
  audio: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  /** Optional tagged place: "Kumo Matcha". */
  placeName?: string;
  liked: boolean;
  /** Whether the current user already follows / is friends with the author. */
  following: boolean;
};

export type NotificationType =
  | 'friend-request'
  | 'friend-accepted'
  | 'comment'
  | 'reaction'
  | 'mention'
  | 'tag'
  | 'group'
  | 'page'
  | 'event'
  | 'birthday'
  | 'memory';

export type NotificationSection = 'new' | 'earlier';

/** A run of notification text; bold runs are names. */
export type TextSegment = {
  text: string;
  bold?: boolean;
};

export type Notification = {
  id: string;
  section: NotificationSection;
  type: NotificationType;
  /** Who caused it. Missing for system notifications (memories). */
  actor?: User;
  /** Picture on the left (the actor's avatar, a group or page avatar). */
  avatar: ImageRef;
  /** Rich text: concatenate, rendering `bold` runs semibold. */
  segments: TextSegment[];
  timeLabel: string;
  unread: boolean;
  /** Small round badge on the avatar's bottom-right corner. */
  badgeIcon: IconName;
  badgeColor: string;
  /** Friend requests show Confirm / Delete buttons under the text. */
  hasActions: boolean;
  /** Extra gray line under the text: "12 mutual friends". */
  detail?: string;
};

export type MenuShortcut = {
  id: string;
  label: string;
  icon: IconName;
  /** Icon tint. */
  color: string;
  /** Optional red-dot text: "3 new". */
  badge?: string;
  /** In-app route to open, when the shortcut maps to a real screen. */
  href?: string;
};

export type MenuRow = {
  id: string;
  label: string;
  icon: IconName;
  /** Rows shown when the section is expanded. */
  children?: MenuRow[];
  destructive?: boolean;
};
