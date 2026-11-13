/**
 * A tiny in-app event bus. `lib/realtime.ts` emits every server envelope by
 * its `type` (`notification`, `move.updated`, `suggestion.created`,
 * `proximity.prompt`, ...). Local events: `socket.open` on each (re)connect,
 * `moves.changed` after any local Move mutation, `saved.changed` after a save
 * toggles. Stores subscribe themselves; a throwing listener never stops the
 * others.
 */

type Listener = (data: unknown) => void;

const listeners = new Map<string, ReadonlySet<Listener>>();

export const appEvents = {
  on(type: string, fn: Listener): () => void {
    listeners.set(type, new Set([...(listeners.get(type) ?? []), fn]));
    return () => {
      const next = new Set(listeners.get(type) ?? []);
      next.delete(fn);
      listeners.set(type, next);
    };
  },
  emit(type: string, data?: unknown): void {
    for (const fn of listeners.get(type) ?? []) {
      try {
        fn(data);
      } catch (e) {
        if (__DEV__) console.warn(`appEvents listener for "${type}" threw`, e);
      }
    }
  },
};
