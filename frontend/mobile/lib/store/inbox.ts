import { create } from 'zustand';

import { api } from '@/lib/session';
import { useUIStore } from '@/lib/store/ui';

/**
 * Moves notifications from the backend (ARCHITECTURE.md 9): pokes, joins,
 * guests pulling up from a shared link, Muse suggestions. `banner` is the one
 * currently shown as an in-app banner (components/InAppBanner.tsx).
 */
export type MoveNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read_at: string | null;
  created_at: string;
};

type InboxState = {
  items: MoveNotification[];
  banner: MoveNotification | null;
  load: () => Promise<void>;
  /** A notification pushed over the socket: list it, show it, bump the badge. */
  arrive: (n: MoveNotification) => void;
  dismissBanner: () => void;
  markAllRead: () => Promise<void>;
};

export const useInbox = create<InboxState>()((set, get) => ({
  items: [],
  banner: null,
  load: async () => {
    try {
      set({ items: await api<MoveNotification[]>('/notifications') });
    } catch {
      // Offline: keep whatever we had.
    }
  },
  arrive: (n) => {
    set((s) => ({ items: [n, ...s.items.filter((x) => x.id !== n.id)], banner: n }));
    const ui = useUIStore.getState();
    ui.setNotificationCount(ui.notificationCount + 1);
  },
  dismissBanner: () => set({ banner: null }),
  markAllRead: async () => {
    if (!get().items.some((n) => !n.read_at)) return;
    const now = new Date().toISOString();
    set((s) => ({ items: s.items.map((n) => ({ ...n, read_at: n.read_at ?? now })) }));
    try {
      await api('/notifications/read', { method: 'POST', body: JSON.stringify({}) });
    } catch {
      // Best effort.
    }
  },
}));
