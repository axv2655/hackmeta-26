import { create } from 'zustand';

export type UIState = {
  /** True once the in-app splash overlay has finished fading out. */
  splashDone: boolean;
  setSplashDone: () => void;
  /** Red count on the Notifications tab. 0 hides the badge. Set from the inbox (lib/store/inbox.ts). */
  notificationCount: number;
  setNotificationCount: (count: number) => void;
  /** Call when the Notifications tab is opened. */
  clearNotificationCount: () => void;
  /** True while the Notifications tab is on screen; arriving notifications then do not bump the badge. */
  notificationsFocused: boolean;
  setNotificationsFocused: (focused: boolean) => void;
};

export const useUIStore = create<UIState>()((set) => ({
  splashDone: false,
  setSplashDone: () => set({ splashDone: true }),
  notificationCount: 0,
  setNotificationCount: (count) => set({ notificationCount: Math.max(0, count) }),
  clearNotificationCount: () => set({ notificationCount: 0 }),
  notificationsFocused: false,
  setNotificationsFocused: (focused) => set({ notificationsFocused: focused }),
}));
