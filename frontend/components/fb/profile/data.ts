import type { IconName } from '@/components/ui/Icon';
import { aspect, currentUser, images, reels } from '@/lib/mock';
import type { ImageRef, Post } from '@/lib/mock';

/** Static profile facts for the signed-in user. */
export const profile = {
  friendCount: 412,
  bio: 'CS @ UT Dallas. Building things, climbing things, drinking too much matcha.',
} as const;

/** Prompt shown in the speech-bubble note above the profile picture. */
export const profileNotePrompt = 'Thinking about...';

/** Copy for the dismissible Muse (our AI agent) promo card. */
export const museCard = {
  title: 'Meet Muse, your personal AI agent',
  body: 'Hand off everyday tasks like finding things to do, planning moves with friends and catching up on your feed.',
  cta: 'Try Muse',
} as const;

/** `IconName` plus the two-ring gender glyph, which is drawn locally. */
export type DetailIcon = IconName | 'gender';

export type ProfileDetail = {
  id: string;
  icon: DetailIcon;
  /** Plain lead-in, e.g. "Lives in". Omit for rows that are just a value ("Male"). */
  prefix?: string;
  /** Value, e.g. "Menlo Park, California". Bold when there is a prefix. */
  value: string;
};

/** "At a glance" rows. */
export const profileDetails: ProfileDetail[] = [
  { id: 'lives', icon: 'map-pin', prefix: 'Lives in', value: 'Menlo Park, California' },
  { id: 'from', icon: 'home', prefix: 'From', value: 'Plano, Texas' },
  { id: 'gender', icon: 'gender', value: 'Male' },
  { id: 'school', icon: 'graduation', prefix: 'Studies Computer Science at', value: 'UT Dallas' },
  { id: 'joined', icon: 'clock', prefix: 'Joined', value: 'August 2019' },
];

export type ProfileTabKey = 'all' | 'photos' | 'reels' | 'memories';

export const profileTabs: { key: ProfileTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'photos', label: 'Photos' },
  { key: 'reels', label: 'Reels' },
  { key: 'memories', label: 'Memories' },
];

export type PostFilterKey = 'all' | 'photos' | 'text' | 'check-ins';

export const postFilters: { key: PostFilterKey; label: string }[] = [
  { key: 'all', label: 'All posts' },
  { key: 'photos', label: 'Photos' },
  { key: 'text', label: 'Text' },
  { key: 'check-ins', label: 'Check-ins' },
];

export function matchesFilter(post: Post, filter: PostFilterKey): boolean {
  switch (filter) {
    case 'photos':
      return post.image !== undefined;
    case 'text':
      return post.image === undefined;
    case 'check-ins':
      return post.placeName !== undefined;
    default:
      return true;
  }
}

/**
 * The seeded home feed has no posts by the current user, so the profile keeps
 * its own short history. Posts created in the app come from the feed store and
 * are shown above these.
 */
export const ownSeedPosts: Post[] = [
  {
    type: 'post',
    id: 'profile-seed-study',
    kind: 'photo',
    author: currentUser,
    timeLabel: '2 d',
    audience: 'friends',
    text: 'Finals week headquarters. If anyone needs me I live on the third floor of the library now.',
    image: images.posts.p4,
    imageAspect: aspect.post,
    likeCount: 64,
    commentCount: 12,
    shareCount: 0,
    liked: false,
    reactions: ['like'],
    dismissible: false,
  },
  {
    type: 'post',
    id: 'profile-seed-capstone',
    kind: 'text',
    author: currentUser,
    timeLabel: '5 d',
    audience: 'friends',
    text: 'Our capstone team now communicates exclusively through memes and it is somehow the most productive we have ever been.',
    likeCount: 37,
    commentCount: 8,
    shareCount: 0,
    liked: true,
    reactions: ['like'],
    dismissible: false,
  },
  {
    type: 'post',
    id: 'profile-seed-matcha',
    kind: 'photo',
    author: currentUser,
    timeLabel: '1 w',
    audience: 'public',
    text: "Third matcha run this week. Maya says it doesn't count as a problem if it's for studying.",
    image: images.posts.p1,
    imageAspect: aspect.post,
    placeName: 'Kumo Matcha',
    likeCount: 91,
    commentCount: 14,
    shareCount: 2,
    liked: false,
    reactions: ['like', 'love'],
    dismissible: false,
  },
];

/** Photos tab: a square grid of the user's uploads. */
export const profilePhotos: { id: string; image: ImageRef }[] = [
  { id: 'ph-1', image: images.posts.p4 },
  { id: 'ph-2', image: images.posts.p1 },
  { id: 'ph-3', image: images.posts.p3 },
  { id: 'ph-4', image: images.stories.s6 },
  { id: 'ph-5', image: images.posts.p5 },
  { id: 'ph-6', image: images.posts.p2 },
  { id: 'ph-7', image: images.stories.s2 },
  { id: 'ph-8', image: images.posts.p6 },
  { id: 'ph-9', image: images.stories.s4 },
];

/** Reels tab: poster frames with a view count. */
export const profileReels: { id: string; poster: ImageRef; viewCount: number }[] = reels.map((reel, index) => ({
  id: `pr-${reel.id}`,
  poster: reel.poster,
  viewCount: [1840, 962, 3100, 427, 12400, 688][index] ?? 500,
}));
