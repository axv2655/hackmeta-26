import type { ImageRef } from './types';

// Metro needs literal require() calls, so every bundled image is listed here
// once. Import `images` instead of calling require() in screens.

/** Portraits, 128x128. Odd numbers are men, even numbers are women; a1 is the current user. */
export const avatars = {
  a1: require('@/assets/mock/avatars/a1.jpg') as ImageRef,
  a2: require('@/assets/mock/avatars/a2.jpg') as ImageRef,
  a3: require('@/assets/mock/avatars/a3.jpg') as ImageRef,
  a4: require('@/assets/mock/avatars/a4.jpg') as ImageRef,
  a5: require('@/assets/mock/avatars/a5.jpg') as ImageRef,
  a6: require('@/assets/mock/avatars/a6.jpg') as ImageRef,
  a7: require('@/assets/mock/avatars/a7.jpg') as ImageRef,
  a8: require('@/assets/mock/avatars/a8.jpg') as ImageRef,
  a9: require('@/assets/mock/avatars/a9.jpg') as ImageRef,
  a10: require('@/assets/mock/avatars/a10.jpg') as ImageRef,
  a11: require('@/assets/mock/avatars/a11.jpg') as ImageRef,
  a12: require('@/assets/mock/avatars/a12.jpg') as ImageRef,
} as const;

/** Feed photos, 1200x900 (4:3). */
export const posts = {
  /** Three lattes held together over a cafe table. */
  p1: require('@/assets/mock/posts/p1.jpg') as ImageRef,
  /** Overhead spread of food bowls. */
  p2: require('@/assets/mock/posts/p2.jpg') as ImageRef,
  /** Friends sitting in a row, arms around each other. */
  p3: require('@/assets/mock/posts/p3.jpg') as ImageRef,
  /** Students studying at a table with laptops. */
  p4: require('@/assets/mock/posts/p4.jpg') as ImageRef,
  /** River valley landscape at dusk. */
  p5: require('@/assets/mock/posts/p5.jpg') as ImageRef,
  /** Barbell on a gym floor. */
  p6: require('@/assets/mock/posts/p6.jpg') as ImageRef,
} as const;

/** Story frames, 540x960 (9:16). */
export const stories = {
  /** Beach at sunset. */
  s1: require('@/assets/mock/stories/s1.jpg') as ImageRef,
  /** Two lattes among plants. */
  s2: require('@/assets/mock/stories/s2.jpg') as ImageRef,
  /** Concert crowd, hand in the air. */
  s3: require('@/assets/mock/stories/s3.jpg') as ImageRef,
  /** Milky Way over a mountain. */
  s4: require('@/assets/mock/stories/s4.jpg') as ImageRef,
  /** Pizza on a board. */
  s5: require('@/assets/mock/stories/s5.jpg') as ImageRef,
  /** Friends watching a sunset. */
  s6: require('@/assets/mock/stories/s6.jpg') as ImageRef,
} as const;

/** Reel poster frames, 720x1280 (9:16). */
export const reels = {
  /** Coffee shop interior. */
  r1: require('@/assets/mock/reels/r1.jpg') as ImageRef,
  /** Plated restaurant dish. */
  r2: require('@/assets/mock/reels/r2.jpg') as ImageRef,
  /** Wooden boat on a mountain lake. */
  r3: require('@/assets/mock/reels/r3.jpg') as ImageRef,
  /** Green hills under clouds. */
  r4: require('@/assets/mock/reels/r4.jpg') as ImageRef,
  /** Stack of sprinkled donuts. */
  r5: require('@/assets/mock/reels/r5.jpg') as ImageRef,
  /** Turquoise lake with a rowboat. */
  r6: require('@/assets/mock/reels/r6.jpg') as ImageRef,
} as const;

/** Profile cover photo, 1200x520. */
export const cover = require('@/assets/mock/cover.jpg') as ImageRef;

export const images = { avatars, posts, stories, reels, cover } as const;

export type AvatarKey = keyof typeof avatars;
export type PostImageKey = keyof typeof posts;
export type StoryImageKey = keyof typeof stories;
export type ReelImageKey = keyof typeof reels;

/** Aspect ratios (width / height) of the bundled sets. */
export const aspect = {
  post: 4 / 3,
  story: 9 / 16,
  reel: 9 / 16,
  cover: 1200 / 520,
} as const;
