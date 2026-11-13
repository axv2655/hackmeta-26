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
  start: () => Promise<void>;
};

let watching: Location.LocationSubscription | null = null;

export const useLocation = create<LocationState>()((set, get) => ({
  coords: null,
  permission: 'unknown',
  start: async () => {
    if (watching || get().permission === 'denied') return;
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') status = (await Location.requestForegroundPermissionsAsync()).status;
      if (status !== 'granted') {
        set({ permission: 'denied' });
        return;
      }
      set({ permission: 'granted' });
      const last = await Location.getLastKnownPositionAsync();
      if (last) set({ coords: { latitude: last.coords.latitude, longitude: last.coords.longitude } });
      watching = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
        (p) => set({ coords: { latitude: p.coords.latitude, longitude: p.coords.longitude } }),
      );
    } catch {
      set({ permission: 'denied' });
    }
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
