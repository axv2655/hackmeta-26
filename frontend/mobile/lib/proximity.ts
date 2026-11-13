import { create } from 'zustand';

import { errorMessage } from './backend';
import { endpoints } from './endpoints';
import { appEvents } from './events';
import { onLogout } from './session';
import { toast } from './toast';
import type { ProximityAcceptResult, ProximityPromptEvent } from './types';

/**
 * The "you're with them, add yourself?" prompt (ARCHITECTURE.md 1.5 rule 5).
 * The server sends realtime `proximity.prompt` when friends who are together
 * post a Move and you are with them (simulated BLE). Nothing joins without a
 * tap: `accept(false)` adds you once, `accept(true)` also puts everyone there
 * on your auto-join list so next time it happens without asking.
 */

type ProximityState = {
  prompt: ProximityPromptEvent | null;
  /** The Move id being accepted, while the call runs. */
  pending: string | null;
  show: (p: ProximityPromptEvent) => void;
  hide: () => void;
  /** Join the prompted Move as `there`. Resolves to the Move id, or null when it failed. */
  accept: (always: boolean) => Promise<string | null>;
};

function isPrompt(v: unknown): v is ProximityPromptEvent {
  if (!v || typeof v !== 'object') return false;
  const p = v as Partial<ProximityPromptEvent>;
  return typeof p.move_id === 'string' && !!p.creator && typeof p.creator === 'object';
}

export const useProximity = create<ProximityState>()((set, get) => ({
  prompt: null,
  pending: null,
  show: (p) => set({ prompt: { ...p, names: Array.isArray(p.names) ? p.names : [] } }),
  hide: () => set({ prompt: null }),
  accept: async (always) => {
    const prompt = get().prompt;
    if (!prompt || get().pending) return null;
    set({ prompt: null, pending: prompt.move_id }); // optimistic hide
    try {
      const res: ProximityAcceptResult = await endpoints.proximity.accept(prompt.move_id, always);
      set({ pending: null });
      appEvents.emit('moves.changed', { move_id: res.move_id });
      toast(always ? `Added. You'll auto-join with them next time.` : 'Added you to the Move');
      return res.move_id;
    } catch (e) {
      // Put the card back only if nothing newer replaced it meanwhile.
      set((s) => ({ pending: null, prompt: s.prompt ?? prompt }));
      toast(errorMessage(e));
      return null;
    }
  },
}));

appEvents.on('proximity.prompt', (data) => {
  if (isPrompt(data)) useProximity.getState().show(data);
});

onLogout(() => useProximity.setState({ prompt: null, pending: null }));
