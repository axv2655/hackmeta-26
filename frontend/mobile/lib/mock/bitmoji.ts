import type { ImageRef } from './types';

/**
 * PLACEHOLDER Bitmoji art, bundled so the Moves map works offline.
 *
 * Two sample avatars (Snap's published example avatar IDs), rendered from
 * sdk.bitmoji.com: `selfie` is the documented head-and-shoulders sticker; the
 * full-body poses come from the undocumented `render/panel/<comic>-<avatarId>`
 * route. Replace with the team's real avatars once each person's avatar ID is
 * known (Snap Login Kit, Staging client + Demo Users).
 *
 * Pose -> comic id: walk 20060199, study 20005047, gym 10211551, dance 20037257,
 * music 10221214, strut 9991430, snack 10227146.
 */
export type BitmojiPose = 'selfie' | 'walk' | 'study' | 'gym' | 'dance' | 'music' | 'strut' | 'snack';

export type BitmojiSet = Record<BitmojiPose, ImageRef>;

const a: BitmojiSet = {
  selfie: require('@/assets/bitmoji/a/selfie.png') as ImageRef,
  walk: require('@/assets/bitmoji/a/walk.png') as ImageRef,
  study: require('@/assets/bitmoji/a/study.png') as ImageRef,
  gym: require('@/assets/bitmoji/a/gym.png') as ImageRef,
  dance: require('@/assets/bitmoji/a/dance.png') as ImageRef,
  music: require('@/assets/bitmoji/a/music.png') as ImageRef,
  strut: require('@/assets/bitmoji/a/strut.png') as ImageRef,
  snack: require('@/assets/bitmoji/a/snack.png') as ImageRef,
};

const b: BitmojiSet = {
  selfie: require('@/assets/bitmoji/b/selfie.png') as ImageRef,
  walk: require('@/assets/bitmoji/b/walk.png') as ImageRef,
  study: require('@/assets/bitmoji/b/study.png') as ImageRef,
  gym: require('@/assets/bitmoji/b/gym.png') as ImageRef,
  dance: require('@/assets/bitmoji/b/dance.png') as ImageRef,
  music: require('@/assets/bitmoji/b/music.png') as ImageRef,
  strut: require('@/assets/bitmoji/b/strut.png') as ImageRef,
  snack: require('@/assets/bitmoji/b/snack.png') as ImageRef,
};

export const bitmojiSets = { a, b } as const;

/** Placeholder assignment until real avatars exist: alternate the two sets by user. */
const byUser: Record<string, BitmojiSet> = {
  'u-anish': b,
  'u-tony': b,
  'u-maya': a,
  'u-priya': a,
  'u-dev': b,
  'u-dhivyesh': b,
  'u-jordan': a,
};

export function bitmojiFor(userId: string, pose: BitmojiPose = 'walk'): ImageRef {
  return (byUser[userId] ?? a)[pose];
}
