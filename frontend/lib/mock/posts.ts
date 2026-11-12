import { aspect, posts as postImages } from './assets';
import type { FeedItem, Post } from './types';
import { dev, dhivyesh, jordan, kumoMatcha, maya, priya, richardsonNow, tony, utdClimbing } from './users';

/** 9700 -> "9.7k", 1100 -> "1.1k", 234 -> "234", 1_250_000 -> "1.3M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}k`;
  }
  const m = n / 1_000_000;
  return `${m >= 100 ? Math.round(m) : Number(m.toFixed(1))}M`;
}

/** formatCount plus a noun: (1100, 'comment') -> "1.1k comments", (1, 'share') -> "1 share". */
export function formatCountLabel(n: number, noun: string): string {
  return `${formatCount(n)} ${noun}${n === 1 ? '' : 's'}`;
}

type PostSeed = Pick<Post, 'id' | 'kind' | 'author' | 'timeLabel'> & Partial<Post>;

function post(seed: PostSeed): Post {
  return {
    type: 'post',
    audience: 'friends',
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    liked: false,
    reactions: ['like'],
    dismissible: false,
    ...(seed.image !== undefined ? { imageAspect: aspect.post } : null),
    ...seed,
  };
}

/** Home feed in display order: posts plus the two unit markers. */
export const feedItems: FeedItem[] = [
  post({
    id: 'post-tony-photo',
    kind: 'photo',
    author: tony,
    timeLabel: '12 m',
    text: "Took three tries and one very patient stranger, but we finally got everyone in the same photo.",
    image: postImages.p3,
    likeCount: 48,
    commentCount: 9,
    shareCount: 1,
    reactions: ['like', 'love'],
  }),
  post({
    id: 'post-maya-life',
    kind: 'life-event',
    author: maya,
    timeLabel: '4 m',
    audience: 'public',
    lifeEvent: { kind: 'relationship', title: 'In a relationship', subtitle: 'Today' },
    likeCount: 132,
    commentCount: 41,
    reactions: ['love', 'like'],
  }),
  { type: 'pymk', id: 'unit-pymk', title: 'People you may know' },
  post({
    id: 'post-richardson-link',
    kind: 'link',
    author: richardsonNow,
    timeLabel: '3 d',
    audience: 'public',
    text: 'The city has approved a protected bike lane on Campbell Road, linking the UT Dallas campus to downtown.',
    image: postImages.p5,
    link: {
      source: 'Richardson Now',
      readTime: '2-min read',
      title: 'Campbell Road bike lane gets the green light from city council',
    },
    likeCount: 9700,
    commentCount: 1100,
    shareCount: 234,
    dismissible: true,
  }),
  { type: 'reels-unit', id: 'unit-reels', title: 'Reels and short videos' },
  post({
    id: 'post-dev-group',
    kind: 'group',
    author: dev,
    group: utdClimbing,
    timeLabel: '1 h',
    audience: 'group',
    text: 'Anyone down for a session at the Activity Center wall Thursday at 7? I have two guest passes and nobody to belay me.',
    image: postImages.p6,
    likeCount: 23,
    commentCount: 14,
  }),
  post({
    id: 'post-priya-text',
    kind: 'text',
    author: priya,
    timeLabel: '2 h',
    text: "Three midterms this week and my laptop charger just died. If you see me asleep on the third floor of the library, no you didn't.",
    likeCount: 67,
    commentCount: 18,
    reactions: ['like', 'love'],
  }),
  post({
    id: 'post-kumo-photo',
    kind: 'photo',
    author: kumoMatcha,
    timeLabel: '5 h',
    audience: 'public',
    text: 'New this week: strawberry matcha latte. Show your student ID for 10% off through Friday.',
    image: postImages.p1,
    likeCount: 1200,
    commentCount: 86,
    shareCount: 37,
    reactions: ['like', 'love'],
    dismissible: true,
  }),
  post({
    id: 'post-dhivyesh-photo',
    kind: 'photo',
    author: dhivyesh,
    timeLabel: '8 h',
    text: 'Cooked for the whole apartment tonight. Giving myself a 9 out of 10, minus one for setting off the smoke alarm.',
    image: postImages.p2,
    likeCount: 54,
    commentCount: 22,
    shareCount: 2,
  }),
  post({
    id: 'post-jordan-photo',
    kind: 'photo',
    author: jordan,
    timeLabel: '1 d',
    placeName: 'Kumo Matcha',
    text: 'The study group lasted about twenty minutes before it turned into a snack review. No regrets.',
    image: postImages.p4,
    likeCount: 39,
    commentCount: 7,
    liked: true,
  }),
  post({
    id: 'post-maya-text',
    kind: 'text',
    author: maya,
    timeLabel: '2 d',
    text: 'Does anyone have a spare graphing calculator I can borrow for Thursday? Will pay in boba.',
    likeCount: 11,
    commentCount: 6,
  }),
];

/** Only the real posts, in feed order (no unit markers). */
export const mockPosts: Post[] = feedItems.filter((item): item is Post => item.type === 'post');

export function isPost(item: FeedItem): item is Post {
  return item.type === 'post';
}
