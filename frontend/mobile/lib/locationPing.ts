import { useEffect } from 'react';
import { AppState } from 'react-native';

import { api } from './backend';
import { coarse, useLocation } from './location';
import { useSession } from './session';

/** How often the open app re-sends its point. The server keeps it for 30 minutes. */
const PING_MS = 4 * 60 * 1000;

/**
 * Tells the server where this phone is (rounded to ~100 m) so "Hey Meta, start a Move" can
 * pick the nearest place: Meta's cloud cannot know where you are. Only while the app is open
 * and in the foreground, only with location permission granted, and the server keeps it
 * in memory only while location sharing is on in Privacy settings. No permission, no ping.
 */
export function useLocationPing(): void {
  const userId = useSession((s) => s.userId);
  const permission = useLocation((s) => s.permission);

  useEffect(() => {
    if (!userId || permission !== 'granted') return;

    const send = () => {
      const { coords } = useLocation.getState();
      if (!coords || AppState.currentState !== 'active') return;
      const point = coarse(coords);
      api.glassesLocation(userId, { lat: point.latitude, lng: point.longitude }).catch(() => {
        // Offline or sharing is off: the glasses flow falls back to your usual place.
      });
    };

    send();
    const timer = setInterval(send, PING_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') send();
    });
    // The first fix usually lands after mount: ping as soon as there is one.
    const unwatch = useLocation.subscribe((state, prev) => {
      if (state.coords && !prev.coords) send();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      unwatch();
    };
  }, [userId, permission]);
}
