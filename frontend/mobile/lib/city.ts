import { useEffect, useState } from 'react';

import type { Coordinate } from './mock/moves';
import { api } from './session';

/**
 * The city at the center of the map ("Menlo Park", "Redwood City"), from
 * `GET /areas/city`. The center is rounded to ~1 km before it leaves the
 * phone, lookups wait until the map settles, and each rounded cell is asked
 * once. Offline, the last name sticks.
 */

const cache = new Map<string, string | null>();
const SETTLE_MS = 350;

const cellOf = (c: Coordinate) => `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;

export function useCityAt(center: Coordinate | null, fallback: string): string {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!center) return;
    const cell = cellOf(center);
    if (cache.has(cell)) {
      const hit = cache.get(cell);
      if (hit) setName(hit);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      const [lat, lng] = cell.split(',');
      try {
        const city = await api<{ name: string | null }>(`/areas/city?lat=${lat}&lng=${lng}`);
        cache.set(cell, city.name);
        if (live && city.name) setName(city.name);
      } catch {
        // Offline or signed out: keep whatever name we last had.
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [center]);

  return name ?? fallback;
}
