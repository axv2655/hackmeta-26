import { create } from 'zustand';

/**
 * Whether the backend answered the last request. `null` before the first one.
 * `api()` in `lib/session.ts` marks it; `<OfflineBar />` reads it.
 */
type ConnectivityState = {
  reachable: boolean | null;
  markOk: () => void;
  markOffline: () => void;
};

export const useConnectivity = create<ConnectivityState>()((set, get) => ({
  reachable: null,
  markOk: () => {
    if (get().reachable !== true) set({ reachable: true });
  },
  markOffline: () => {
    if (get().reachable !== false) set({ reachable: false });
  },
}));
