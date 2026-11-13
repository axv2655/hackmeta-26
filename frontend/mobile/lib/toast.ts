import { create } from 'zustand';

/**
 * One short message at the bottom of the screen ("Couldn't save. Try again").
 * Call `toast()` from anywhere (stores included); `<Toast />` in the root layout
 * renders `useToast().current`. A new toast replaces the one on screen.
 */
export type ToastAction = { label: string; onPress: () => void };

export type ToastItem = {
  id: number;
  message: string;
  action: ToastAction | null;
};

type ToastState = {
  current: ToastItem | null;
  show: (message: string, action?: ToastAction) => void;
  hide: (id?: number) => void;
};

const VISIBLE_MS = 3500;
const VISIBLE_WITH_ACTION_MS = 5500;

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export const useToast = create<ToastState>()((set, get) => ({
  current: null,
  show: (message, action) => {
    clearTimer();
    const item: ToastItem = { id: nextId++, message, action: action ?? null };
    set({ current: item });
    timer = setTimeout(() => get().hide(item.id), action ? VISIBLE_WITH_ACTION_MS : VISIBLE_MS);
  },
  hide: (id) => {
    const current = get().current;
    if (!current || (id !== undefined && current.id !== id)) return;
    clearTimer();
    set({ current: null });
  },
}));

/** Show a toast. `action` adds one text button ("Undo", "Retry"). */
export function toast(message: string, action?: ToastAction): void {
  useToast.getState().show(message, action);
}
