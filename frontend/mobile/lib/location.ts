import * as Location from 'expo-location';
import { create } from 'zustand';

import { myPosition, type Coordinate } from './mock/moves';

/**
 * Where this phone is (ARCHITECTURE.md 1.5 rule 1-2). Opt-in: the first time
 * the Moves map or the composer opens, ask for "while using the app"; with it
 * denied everything still works around a default spot (the Meta campus).
 *
 * The exact position stays on the phone (the "Me" pin, distances). Anything
 * sent to the server goes through `coarse()` first.
 */

type Permission = 'unknown' | 'granted' | 'denied';

type LocationState = {
  /** Live position, or null before the first fix / without permission. */
  coords: Coordinate | null;
  permission: Permission;
  /** False once the OS will no longer show the prompt (user must use Settings). */
  canAskAgain: boolean;
  /** Ask (when the OS still can) and start watching. */
  start: () => Promise<void>;
  /** Read the permission without prompting; start watching if now granted. */
  recheck: () => Promise<void>;
  /** Stop watching. Keeps the permission and the last fix. */
  stop: () => void;
};

let watching: Location.LocationSubscription | null = null;
let starting = false;

type Set = (partial: Partial<LocationState>) => void;

const toCoord = (p: Location.LocationObject): Coordinate => ({
  latitude: p.coords.latitude,
  longitude: p.coords.longitude,
});

async function watch(set: Set) {
  if (watching) return;
  const last = await Location.getLastKnownPositionAsync();
  if (last) set({ coords: toCoord(last) });
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
    (p) => set({ coords: toCoord(p) }),
  );
  if (watching) sub.remove();
  else watching = sub;
}

export const useLocation = create<LocationState>()((set, get) => ({
  coords: null,
  permission: 'unknown',
  canAskAgain: true,
  start: async () => {
    if (watching || starting) return;
    if (get().permission === 'denied' && !get().canAskAgain) return;
    starting = true;
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        set({ permission: 'denied', canAskAgain: perm.canAskAgain });
        return;
      }
      set({ permission: 'granted', canAskAgain: true });
      await watch(set);
    } catch {
      set({ permission: 'denied' });
    } finally {
      starting = false;
    }
  },
  recheck: async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        set({ permission: 'granted', canAskAgain: true });
        await watch(set);
        return;
      }
      get().stop();
      set({ permission: perm.status === 'denied' ? 'denied' : 'unknown', canAskAgain: perm.canAskAgain });
    } catch {
      // Keep the current state; the app works without location.
    }
  },
  stop: () => {
    watching?.remove();
    watching = null;
  },
}));

/** Where to center things: the live position, else the default spot. */
export function here(): Coordinate {
  return useLocation.getState().coords ?? myPosition;
}

/** Rounded to ~100 m before it leaves the phone (the "near" query). */
export function coarse(c: Coordinate): Coordinate {
  return { latitude: Math.round(c.latitude * 1000) / 1000, longitude: Math.round(c.longitude * 1000) / 1000 };
}

/** Great-circle distance in km. */
export function kmBetween(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
