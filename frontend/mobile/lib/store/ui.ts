import { create } from 'zustand';

import { initialUnreadCount } from '@/lib/mock/notifications';

export type UIState = {
  /** True once the in-app splash overlay has finished fading out. */
  splashDone: boolean;
  setSplashDone: () => void;
  /** Red count on the Notifications tab. 0 hides the badge. */
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  /** Call when the Notifications tab is opened. */
  clearNotificationCount: () => void;
};

export const useUIStore = create<UIState>()((set) => ({
  splashDone: false,
  setSplashDone: () => set({ splashDone: true }),
  notificationCount: initialUnreadCount,
  setNotificationCount: (count) => set({ notificationCount: Math.max(0, count) }),
  clearNotificationCount: () => set({ notificationCount: 0 }),
}));
