import { create } from 'zustand';

import { endpoints } from '@/lib/endpoints';
import { onLogout } from '@/lib/session';
import type { MuseStatus } from '@/lib/types';

/**
 * Whether Muse (the hackathon model) is really answering or every agent is on
 * its heuristic fallback. `MuseBadge` uses it to label Muse output honestly.
 */
type MuseStatusState = {
  status: MuseStatus | null;
  loading: boolean;
  /** Loads `GET /muse/status` once per session. Safe to call from many screens. */
  load: () => Promise<void>;
};

export const useMuseStatus = create<MuseStatusState>()((set, get) => ({
  status: null,
  loading: false,
  load: async () => {
    if (get().status || get().loading) return;
    set({ loading: true });
    try {
      set({ status: await endpoints.muse.status(), loading: false });
    } catch {
      // Unknown status reads as heuristic, which is the honest default.
      set({ loading: false });
    }
  },
}));

onLogout(() => useMuseStatus.setState({ status: null, loading: false }));

export type MuseSource = 'muse' | 'heuristic';

/** The source to show: the item's own, else whether Muse is live right now. */
export function resolveMuseSource(source?: MuseSource): MuseSource {
  if (source) return source;
  return useMuseStatus.getState().status?.live ? 'muse' : 'heuristic';
}

/** "Muse" when the model answered, "Muse · heuristic" when its fallback did. */
export function museSourceLabel(source?: MuseSource): string {
  return resolveMuseSource(source) === 'muse' ? 'Muse' : 'Muse · heuristic';
}
