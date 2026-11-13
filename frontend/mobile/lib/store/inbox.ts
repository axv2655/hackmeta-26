import { create } from 'zustand';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { useFriends } from '@/lib/friends';
import { onLogout, useSession } from '@/lib/session';
import { useUIStore } from '@/lib/store/ui';
import { toast } from '@/lib/toast';
import type { Notification } from '@/lib/types';

/**
 * Moves notifications from the backend (ARCHITECTURE.md 9): pokes, joins,
 * guests pulling up from a shared link, Muse suggestions. `banner` is the one
 * currently shown as an in-app banner (components/InAppBanner.tsx).
 *
 * The tab badge (`useUIStore.notificationCount`) is derived here: unread
 * notifications plus incoming friend requests that the user has not seen yet.
 * Opening the Notifications tab marks everything on it as seen (the rows keep
 * their unread tint until tapped), and while the tab is open the badge is 0.
 */
export type MoveNotification = Notification;

type Status = 'idle' | 'loading' | 'ready' | 'error';

type InboxState = {
  items: MoveNotification[];
  banner: MoveNotification | null;
  status: Status;
  error: string | null;
  /** Notification ids and `req:{userId}` keys already counted as seen by the badge. */
  seen: Record<string, true>;
  load: () => Promise<void>;
  /** A notification pushed over the socket: list it and show it as a banner. */
  arrive: (n: MoveNotification) => void;
  dismissBanner: () => void;
  unread: () => number;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Everything currently listed (notifications and friend requests) stops counting toward the badge. */
  seeAll: () => void;
};

const unreadCount = (items: MoveNotification[]): number => items.filter((n) => !n.read_at).length;
const reqKey = (userId: string): string => `req:${userId}`;

/** The account whose friend requests were last loaded from here. */
let friendsLoadedFor = '';

function readAt(items: MoveNotification[], ids: Set<string> | null, at: string): MoveNotification[] {
  return items.map((n) => (!n.read_at && (!ids || ids.has(n.id)) ? { ...n, read_at: at } : n));
}

export const useInbox = create<InboxState>()((set, get) => ({
  items: [],
  banner: null,
  status: 'idle',
  error: null,
  seen: {},
  load: async () => {
    const userId = useSession.getState().userId;
    if (!userId) return;
    // Friend requests count toward the badge too: load them once per signed-in account.
    if (friendsLoadedFor !== userId) {
      friendsLoadedFor = userId;
      void useFriends.getState().load();
    }
    set((s) => ({ status: s.status === 'ready' ? 'ready' : 'loading', error: null }));
    try {
      const items = await endpoints.notifications.list();
      set({ items, status: 'ready', error: null });
    } catch (e) {
      // Keep whatever we had; the screen shows the error only when there is nothing to show.
      set({ status: 'error', error: errorMessage(e) });
    }
  },
  arrive: (n) => {
    const focused = useUIStore.getState().notificationsFocused;
    set((s) => ({
      items: [n, ...s.items.filter((x) => x.id !== n.id)],
      banner: n,
      seen: focused ? { ...s.seen, [n.id]: true } : s.seen,
    }));
  },
  dismissBanner: () => set({ banner: null }),
  unread: () => unreadCount(get().items),
  markRead: async (ids) => {
    const wanted = new Set(ids);
    const before = get().items;
    if (!before.some((n) => !n.read_at && wanted.has(n.id))) return;
    set({ items: readAt(before, wanted, new Date().toISOString()) });
    try {
      await endpoints.notifications.read(ids);
    } catch (e) {
      set({ items: before });
      toast(errorMessage(e));
    }
  },
  markAllRead: async () => {
    const before = get().items;
    if (!before.some((n) => !n.read_at)) {
      toast("You're all caught up");
      return;
    }
    set({ items: readAt(before, null, new Date().toISOString()) });
    try {
      await endpoints.notifications.read();
    } catch (e) {
      set({ items: before });
      toast(errorMessage(e));
    }
  },
  seeAll: () => {
    const next: Record<string, true> = { ...get().seen };
    for (const n of get().items) if (!n.read_at) next[n.id] = true;
    for (const p of useFriends.getState().incoming) next[reqKey(p.user.id)] = true;
    set({ seen: next });
  },
}));

/** The badge number: 0 while the tab is open, else unseen unread notifications + unseen friend requests. */
export function badgeCount(): number {
  if (useUIStore.getState().notificationsFocused) return 0;
  const { items, seen } = useInbox.getState();
  const notes = items.filter((n) => !n.read_at && !seen[n.id]).length;
  const requests = useFriends.getState().incoming.filter((p) => !seen[reqKey(p.user.id)]).length;
  return notes + requests;
}

function syncBadge(): void {
  const count = badgeCount();
  if (useUIStore.getState().notificationCount !== count) useUIStore.getState().setNotificationCount(count);
}

/**
 * Called by the Notifications tab on focus (true) and blur (false). Both mark
 * what is listed as seen, so leaving the tab does not bring the badge back.
 */
export function setInboxFocused(focused: boolean): void {
  useInbox.getState().seeAll();
  useUIStore.getState().setNotificationsFocused(focused);
}

useInbox.subscribe(syncBadge);
useFriends.subscribe(syncBadge);
useUIStore.subscribe((s, prev) => {
  if (s.notificationsFocused !== prev.notificationsFocused) syncBadge();
});

onLogout(() => {
  friendsLoadedFor = '';
  useInbox.setState({ items: [], banner: null, status: 'idle', error: null, seen: {} });
  useUIStore.getState().setNotificationsFocused(false);
  useUIStore.getState().setNotificationCount(0);
});
