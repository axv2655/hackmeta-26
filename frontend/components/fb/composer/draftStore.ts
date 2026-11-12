import { create } from 'zustand';

import type { Audience, ImageRef, PostDraft } from '@/lib/mock';

import { nextAudience } from './audience';

export type MusicTrack = { title: string; artist: string };

/** The track the share screen offers by default (fictional). */
export const defaultTrack: MusicTrack = { title: 'late drive (slowed)', artist: 'Mellow Tide' };

export type ComposerDraft = {
  text: string;
  image?: ImageRef;
  imageAspect?: number;
  /** Id from `composerBackgrounds`, or null for a plain text post. Never set together with `image`. */
  backgroundId: string | null;
  audience: Audience;
  music: MusicTrack | null;
  aiLabel: boolean;
};

export type ComposerState = ComposerDraft & {
  setText: (text: string) => void;
  /** Attaches a photo. Photos and colored backgrounds are exclusive, so this clears the background. */
  attachImage: (image: ImageRef, aspect: number) => void;
  removeImage: () => void;
  setBackground: (id: string | null) => void;
  /** Public -> Friends -> Only me -> Public. */
  cycleAudience: () => void;
  setMusic: (track: MusicTrack | null) => void;
  setAiLabel: (on: boolean) => void;
  /** Back to an empty draft. */
  reset: () => void;
};

const emptyDraft: ComposerDraft = {
  text: '',
  image: undefined,
  imageAspect: undefined,
  backgroundId: null,
  audience: 'friends',
  music: defaultTrack,
  aiLabel: false,
};

/** The post being written. Shared by the Create post and New post screens. */
export const useComposerStore = create<ComposerState>()((set) => ({
  ...emptyDraft,

  setText: (text) => set({ text }),
  attachImage: (image, aspect) => set({ image, imageAspect: aspect, backgroundId: null }),
  removeImage: () => set({ image: undefined, imageAspect: undefined }),
  setBackground: (id) => set({ backgroundId: id }),
  cycleAudience: () => set((state) => ({ audience: nextAudience(state.audience) })),
  setMusic: (track) => set({ music: track }),
  setAiLabel: (on) => set({ aiLabel: on }),
  reset: () => set({ ...emptyDraft }),
}));

/** A draft can be posted once it has text or a photo. */
export function hasContent(draft: Pick<ComposerDraft, 'text' | 'image'>): boolean {
  return draft.text.trim().length > 0 || draft.image !== undefined;
}

/** The slice of the draft the feed store understands. */
export function toPostDraft(draft: ComposerDraft): PostDraft {
  return {
    text: draft.text,
    audience: draft.audience,
    ...(draft.image !== undefined ? { image: draft.image, imageAspect: draft.imageAspect } : null),
  };
}
