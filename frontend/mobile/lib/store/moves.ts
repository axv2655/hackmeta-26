import { create } from 'zustand';

import type { MapMove } from '@/lib/mock/moves';

/**
 * Moves the user posted this session. The map shows them only on top of the
 * sample world (lib/live `sample`); with the backend reachable its copy is
 * the one shown. `focusId` asks the Moves tab to open a Move's card (set when
 * the composer closes or a notification is tapped); a Move that is not on the
 * map opens its own screen instead.
 */
type MyMovesState = {
  mine: MapMove[];
  focusId: string | null;
  add: (move: MapMove) => void;
  focus: (id: string | null) => void;
};

export const useMyMoves = create<MyMovesState>()((set) => ({
  mine: [],
  focusId: null,
  add: (move) => set((s) => ({ mine: [move, ...s.mine.filter((m) => m.id !== move.id)] })),
  focus: (id) => set({ focusId: id }),
}));
