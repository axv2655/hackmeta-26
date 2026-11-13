import { create } from 'zustand';

import type { FeedReel } from '@/lib/reels';
import { onLogout } from '@/lib/session';

/** A reel can be liked (blue thumb, from the rail) or loved (red heart, from a double tap). */
export type ReelReaction = 'like' | 'love';

type ReelsUIState = {
  /** Reaction per reel id. Missing = the reel's own `liked` flag. `null` = no reaction. */
  reactions: Record<string, ReelReaction | null>;
  /** Follow state per author id (following someone applies to all of their reels). */
  following: Record<string, boolean>;
  setReaction: (reelId: string, reaction: ReelReaction | null) => void;
  toggleFollow: (authorId: string, current: boolean) => void;
};

/**
 * Viewer-side, on-device state for the Reels tab (reactions and follows; the
 * backend has no likes). It lives outside the list rows so a reaction or
 * follow survives the pager recycling a page. Saves are server state in
 * `lib/reels.ts`.
 */
export const useReelsStore = create<ReelsUIState>((set) => ({
  reactions: {},
  following: {},
  setReaction: (reelId, reaction) => set((state) => ({ reactions: { ...state.reactions, [reelId]: reaction } })),
  toggleFollow: (authorId, current) => set((state) => ({ following: { ...state.following, [authorId]: !current } })),
}));

onLogout(() => useReelsStore.setState({ reactions: {}, following: {} }));

/** The viewer's reaction to a reel, falling back to the seeded `liked` flag. */
export function reactionFor(state: ReelsUIState, reel: FeedReel): ReelReaction | null {
  const set = state.reactions[reel.id];
  if (set !== undefined) return set;
  return reel.liked ? 'like' : null;
}

/** Whether the viewer follows a reel's author. */
export function followingFor(state: ReelsUIState, reel: FeedReel): boolean {
  return state.following[reel.author.id] ?? reel.following;
}

/** The reel's like count adjusted for what the viewer has done since it loaded. */
export function likeCountFor(reel: FeedReel, reaction: ReelReaction | null): number {
  const reacted = reaction != null;
  if (reacted === reel.liked) return reel.likeCount;
  return reel.likeCount + (reacted ? 1 : -1);
}

/** Save count: the backend has none, so about one save per eight likes plus the viewer's own. */
export function saveCountFor(reel: FeedReel, saved: boolean): number {
  return Math.round(reel.likeCount / 8) + (saved ? 1 : 0);
}
