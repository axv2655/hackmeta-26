import { useEffect } from 'react';
import { AppState } from 'react-native';

import { MovesBle } from '@/modules/moves-ble';

import { endpoints } from './endpoints';
import { useSession } from './session';
import { useSettings } from './settings';
import { toast } from './toast';

/**
 * Real BLE proximity (ARCHITECTURE.md 8.2). While the app is open and the user
 * has turned on Bluetooth proximity, the phone advertises a rotating server
 * token (as a service UUID; never a user id) and scans for friends' tokens.
 * Sightings go to the server every few seconds; when you've pulled up to a
 * Move and you're with someone already there, the server marks you there.
 *
 * Off in Expo Go / web / old builds (no native module) and with
 * EXPO_PUBLIC_PROXIMITY=sim: the Demo Control co-presence trigger still works.
 */

const FLUSH_MS = 5_000;
const TOKEN_REFRESH_MS = 12 * 60 * 1000; // tokens live 15 minutes

export const BLE_AVAILABLE =
  MovesBle != null && process.env.EXPO_PUBLIC_PROXIMITY !== 'sim';

function useBleOptIn(): boolean {
  const fromSettings = useSettings((s) => s.me?.settings.ble_opt_in);
  const fromSession = useSession((s) => s.me?.settings.ble_opt_in);
  return Boolean(fromSettings ?? fromSession);
}

type Radio = { stop: () => void };

function startRadio(): Radio {
  const ble = MovesBle!;
  const seen = new Map<string, number>(); // uuid -> strongest rssi this window
  let stopped = false;
  let flushing = false;

  const refreshToken = async () => {
    try {
      const { uuid } = await endpoints.proximity.token();
      if (!stopped) ble.start(uuid);
    } catch {
      // Offline or opted out on the server: try again on the next refresh.
    }
  };

  const flush = async () => {
    if (flushing || seen.size === 0 || AppState.currentState !== 'active')
      return;
    const batch = [...seen].map(([token, rssi]) => ({ token, rssi }));
    seen.clear();
    flushing = true;
    try {
      const res = await endpoints.proximity.sightings(batch);
      if (res.arrived.length > 0) toast("You're there. Marked you as arrived.");
    } catch {
      // Dropped batch: the next one carries fresh sightings anyway.
    } finally {
      flushing = false;
    }
  };

  const sub = ble.addListener('onSighting', ({ uuid, rssi }) => {
    seen.set(uuid, Math.max(rssi, seen.get(uuid) ?? -999));
  });
  void refreshToken();
  const flushTimer = setInterval(() => void flush(), FLUSH_MS);
  const tokenTimer = setInterval(() => void refreshToken(), TOKEN_REFRESH_MS);

  return {
    stop: () => {
      stopped = true;
      clearInterval(flushTimer);
      clearInterval(tokenTimer);
      sub.remove();
      ble.stop();
    },
  };
}

/** Mount once in the root layout. Runs the radio only in the foreground. */
export function useBleProximity(): void {
  const userId = useSession((s) => s.userId);
  const optIn = useBleOptIn();

  useEffect(() => {
    if (!BLE_AVAILABLE || !userId || !optIn) return;
    let radio: Radio | null =
      AppState.currentState === 'active' ? startRadio() : null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !radio) radio = startRadio();
      if (state !== 'active' && radio) {
        radio.stop();
        radio = null;
      }
    });
    return () => {
      sub.remove();
      radio?.stop();
    };
  }, [userId, optIn]);
}
