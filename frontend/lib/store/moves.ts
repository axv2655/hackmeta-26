import { create } from 'zustand';

import type { MapMove } from '@/lib/mock/moves';

/**
 * Moves the user posted this session, shown on their map next to the mock
 * world until the map reads Moves from the backend. `focusId` asks the Moves
 * tab to open a Move's card (set when the composer closes).
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
