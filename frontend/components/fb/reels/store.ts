import { create } from 'zustand';

import { reels, type Reel } from '@/lib/mock';

/** A reel can be liked (blue thumb, from the rail) or loved (red heart, from a double tap). */
export type ReelReaction = 'like' | 'love';

type ReelsState = {
  /** Reaction per reel id. `null` = no reaction. */
  reactions: Record<string, ReelReaction | null>;
  /** Follow state per author id (following someone applies to all of their reels). */
  following: Record<string, boolean>;
  setReaction: (reelId: string, reaction: ReelReaction | null) => void;
  toggleFollow: (authorId: string) => void;
};

function seedReactions(): Record<string, ReelReaction | null> {
  const out: Record<string, ReelReaction | null> = {};
  for (const reel of reels) out[reel.id] = reel.liked ? 'like' : null;
  return out;
}

function seedFollowing(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const reel of reels) out[reel.author.id] = reel.following;
  return out;
}

/**
 * Viewer-side state for the Reels tab. It lives outside the list rows so a
 * reaction or follow survives the pager recycling a page.
 */
export const useReelsStore = create<ReelsState>((set) => ({
  reactions: seedReactions(),
  following: seedFollowing(),
  setReaction: (reelId, reaction) =>
    set((state) => ({ reactions: { ...state.reactions, [reelId]: reaction } })),
  toggleFollow: (authorId) =>
    set((state) => ({ following: { ...state.following, [authorId]: !state.following[authorId] } })),
}));

/** The reel's like count adjusted for what the viewer has done since the mock was seeded. */
export function likeCountFor(reel: Reel, reaction: ReelReaction | null): number {
  const reacted = reaction != null;
  if (reacted === reel.liked) return reel.likeCount;
  return reel.likeCount + (reacted ? 1 : -1);
}
