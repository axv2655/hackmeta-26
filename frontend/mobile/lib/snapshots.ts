import { create } from 'zustand';

import { errorMessage } from './backend';
import { endpoints } from './endpoints';
import { appEvents } from './events';
import { toast } from './toast';

/**
 * Snapshots: Instagram-Instants-style photos taken live while you are in a
 * Move. On the server a snapshot is an untagged Moment (approved at once), so
 * everyone who can see the Move sees it. Until the upload lands, the photo
 * shows from the phone's own file; in the sample world it stays local.
 */
export type LocalSnapshot = { uri: string; at: number; state: 'sending' | 'local' | 'failed' };

type SnapshotsState = {
  /** Snapshots not (yet) on the server, newest first, by Move id. */
  byMove: Record<string, LocalSnapshot[]>;
  add: (moveId: string, snap: LocalSnapshot) => void;
  update: (moveId: string, uri: string, patch: Partial<LocalSnapshot> | null) => void;
};

export const useSnapshots = create<SnapshotsState>()((set) => ({
  byMove: {},
  add: (moveId, snap) =>
    set((s) => ({ byMove: { ...s.byMove, [moveId]: [snap, ...(s.byMove[moveId] ?? [])] } })),
  // patch null removes the snapshot (it is on the server now)
  update: (moveId, uri, patch) =>
    set((s) => {
      const list = s.byMove[moveId] ?? [];
      const next = patch === null ? list.filter((x) => x.uri !== uri) : list.map((x) => (x.uri === uri ? { ...x, ...patch } : x));
      return { byMove: { ...s.byMove, [moveId]: next } };
    }),
}));

/** Keep the photo on screen right away, then upload it (unless the sample world is showing). */
export function saveSnapshot(moveId: string, uri: string, sample: boolean): void {
  const { add, update } = useSnapshots.getState();
  add(moveId, { uri, at: Date.now(), state: sample ? 'local' : 'sending' });
  if (sample) return;
  endpoints.moments
    .upload(moveId, uri)
    .then(() => {
      update(moveId, uri, null);
      appEvents.emit('moment.added', { move_id: moveId }); // the Move's Moments reload
    })
    .catch((e) => {
      update(moveId, uri, { state: 'failed' });
      toast(`Snapshot not shared: ${errorMessage(e)}`);
    });
}
