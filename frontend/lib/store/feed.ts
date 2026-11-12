import { create } from 'zustand';

import { aspect } from '@/lib/mock/assets';
import { feedItems } from '@/lib/mock/posts';
import type { FeedItem, Post, PostDraft } from '@/lib/mock/types';
import { currentUser } from '@/lib/mock/users';

export type FeedState = {
  /** Home feed in display order: posts plus the 'reels-unit' and 'pymk' markers. */
  posts: FeedItem[];
  /** Prepends a new post by the current user and returns it. */
  addPost: (draft: PostDraft) => Post;
  /** Flips `liked` on a post and moves `likeCount` by one. Unknown ids are ignored. */
  toggleLike: (postId: string) => void;
  /** Removes a feed item (the X on a post or unit). Unknown ids are ignored. */
  removeItem: (itemId: string) => void;
  /** Restores the seeded feed. */
  reset: () => void;
};

let nextLocalId = 1;

export const useFeedStore = create<FeedState>()((set) => ({
  posts: feedItems,

  addPost: (draft) => {
    const text = draft.text.trim();
    const post: Post = {
      type: 'post',
      id: `post-local-${nextLocalId++}`,
      kind: draft.image !== undefined ? 'photo' : 'text',
      author: currentUser,
      timeLabel: 'Just now',
      audience: draft.audience ?? 'friends',
      ...(text ? { text } : null),
      ...(draft.image !== undefined
        ? { image: draft.image, imageAspect: draft.imageAspect ?? aspect.post }
        : null),
      ...(draft.placeName ? { placeName: draft.placeName } : null),
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      liked: false,
      reactions: ['like'],
      dismissible: false,
    };
    set((state) => ({ posts: [post, ...state.posts] }));
    return post;
  },

  toggleLike: (postId) =>
    set((state) => ({
      posts: state.posts.map((item) =>
        item.type === 'post' && item.id === postId
          ? { ...item, liked: !item.liked, likeCount: Math.max(0, item.likeCount + (item.liked ? -1 : 1)) }
          : item,
      ),
    })),

  removeItem: (itemId) => set((state) => ({ posts: state.posts.filter((item) => item.id !== itemId) })),

  reset: () => set({ posts: feedItems }),
}));
