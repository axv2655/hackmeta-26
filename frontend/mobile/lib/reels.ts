import { create } from 'zustand';

import { errorMessage } from './backend';
import { mockAllowed } from './demo';
import { endpoints, type LatLng } from './endpoints';
import { appEvents } from './events';
import { coarse, here } from './location';
import { reels as mockReels } from './mock';
import { avatars } from './mock/assets';
import type { ImageRef, Reel as MockReel, User } from './mock/types';
import { onLogout, useSession } from './session';
import { toast } from './toast';
import type { MuseMark, Reel } from './types';

/**
 * Reels from `GET /reels`, dressed with the bundled media. A backend reel whose
 * `thumb_url` is `bundle:<mock reel id>` borrows that mock reel's poster and
 * author photo; any other URL is loaded as a remote image. The bundled mock
 * reels are shown on their own only when the backend cannot be reached (or in
 * a demo build that fails to load), flagged `sample`.
 */

export type ReelPoster = ImageRef | { uri: string };

export type FeedReel = Omit<MockReel, 'poster'> & {
  poster: ReelPoster;
  /** The Mark the server resolved or geotagged, if any. */
  mark: MuseMark | null;
  distanceMi: number | null;
  saved: boolean;
  /** A place named in the caption that Muse can still resolve (no Mark yet). */
  placeHint: string | null;
  /** Bundled sample data shown while offline: nothing on it can be changed. */
  sample: boolean;
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

type ReelsState = {
  items: FeedReel[];
  status: Status;
  error: string | null;
  sample: boolean;
  load: () => Promise<void>;
  toggleSave: (reelId: string) => Promise<void>;
};

const BUNDLE = 'bundle:';
const AVATARS = Object.values(avatars);
const SELF = 'reels-store';

/** The bundled mock reel behind a `bundle:<id>` URL, if any. */
export function bundledReel(url: string | null | undefined): MockReel | undefined {
  if (!url?.startsWith(BUNDLE)) return undefined;
  const id = url.slice(BUNDLE.length);
  return mockReels.find((r) => r.id === id);
}

/** Image source for a reel thumbnail or video URL (bundled frame or remote). */
export function reelPoster(url: string): ReelPoster | null {
  const mock = bundledReel(url);
  if (mock) return mock.poster;
  return /^https?:\/\//.test(url) ? { uri: url } : null;
}

/** The viewer's coarse position for the "near" query (never stored server side). */
export function nearHere(): LatLng {
  const c = coarse(here());
  return { lat: c.latitude, lng: c.longitude };
}

/**
 * Whether the caption seems to name a place: two or more capitalized words in
 * a row ("Sunbeam Matcha Bar"). Returns that run, or null. Only a gate for the
 * "Find this place" chip; Muse's place resolver decides what the place is.
 */
export function captionHint(caption: string): string | null {
  const match = caption.match(/\b[A-Z][\w'&-]+(?:\s[A-Z][\w'&-]+)+/);
  return match ? match[0] : null;
}

function pageAuthor(name: string): User {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return {
    id: `reel-author:${name}`,
    kind: 'page',
    name,
    firstName: name.split(' ')[0] ?? name,
    avatar: AVATARS[hash % AVATARS.length],
    verified: false,
    mutualFriends: 0,
    isFriend: false,
    online: false,
    subtitle: '',
  };
}

function authorFor(name: string, mock?: MockReel): User {
  if (!mock) return pageAuthor(name);
  if (mock.author.name === name) return mock.author;
  return { ...mock.author, id: `reel-author:${name}`, name, firstName: name.split(' ')[0] ?? name, verified: false };
}

function fromApi(r: Reel): FeedReel {
  const mock = bundledReel(r.thumb_url) ?? bundledReel(r.video_url);
  const poster = mock?.poster ?? reelPoster(r.thumb_url) ?? reelPoster(r.video_url) ?? AVATARS[0];
  return {
    id: r.id,
    author: authorFor(r.author_name, mock),
    poster,
    caption: r.caption,
    audio: mock?.audio ?? `Original audio · ${r.author_name}`,
    likeCount: r.likes,
    commentCount: mock?.commentCount ?? Math.round(r.likes / 25),
    shareCount: mock?.shareCount ?? Math.round(r.likes / 12),
    viewCount: mock?.viewCount ?? r.likes * 11,
    placeName: r.mark?.name,
    liked: false,
    following: mock?.following ?? false,
    mark: r.mark,
    distanceMi: r.distance_mi,
    saved: r.saved,
    placeHint: r.mark ? null : captionHint(r.caption),
    sample: false,
  };
}

function fromMock(r: MockReel): FeedReel {
  return {
    ...r,
    mark: null,
    distanceMi: null,
    saved: false,
    placeHint: r.placeName ?? null,
    sample: true,
  };
}

function withSaved(items: FeedReel[], id: string, saved: boolean): FeedReel[] {
  return items.map((r) => (r.id === id ? { ...r, saved } : r));
}

type ReelsData = Pick<ReelsState, 'items' | 'status' | 'error' | 'sample'>;
const empty = (): ReelsData => ({ items: [], status: 'idle', error: null, sample: false });

export const useReels = create<ReelsState>()((set, get) => ({
  ...empty(),
  load: async () => {
    if (!useSession.getState().userId) return;
    const hasData = get().items.length > 0;
    set({ status: hasData ? 'ready' : 'loading', error: null });
    try {
      const rows = await endpoints.reels.list(nearHere());
      set({ items: rows.map(fromApi), status: 'ready', error: null, sample: false });
    } catch (e) {
      if (hasData && !get().sample) {
        set({ status: 'ready', error: errorMessage(e) });
      } else if (mockAllowed(e)) {
        set({ items: mockReels.map(fromMock), status: 'ready', error: null, sample: true });
      } else {
        set({ status: 'error', error: errorMessage(e) });
      }
    }
  },
  toggleSave: async (reelId) => {
    const reel = get().items.find((r) => r.id === reelId);
    if (!reel) return;
    if (reel.sample) {
      toast("You're offline");
      return;
    }
    const save = !reel.saved;
    set({ items: withSaved(get().items, reelId, save) });
    try {
      await (save ? endpoints.reels.save(reelId) : endpoints.reels.unsave(reelId));
      // useSaved reloads itself on 'saved.changed' (the Saved screen and Mark pins follow).
      appEvents.emit('saved.changed', { from: SELF, reel_id: reelId, saved: save });
      toast(save ? 'Saved' : 'Removed from saved');
    } catch (e) {
      set({ items: withSaved(get().items, reelId, reel.saved) });
      toast(errorMessage(e));
    }
  },
}));

// A save elsewhere (a Mark from the map, the Saved screen) can change a reel's flag.
appEvents.on('saved.changed', (data) => {
  const from = (data as { from?: unknown } | undefined)?.from;
  const { items, sample } = useReels.getState();
  if (from !== SELF && items.length > 0 && !sample) void useReels.getState().load();
});
onLogout(() => useReels.setState(empty()));
