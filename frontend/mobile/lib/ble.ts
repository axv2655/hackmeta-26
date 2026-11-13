import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { MovesBle } from '@/modules/moves-ble';

import { errorMessage } from './backend';
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
 * `useBleStatus` is what the Privacy screen shows, so a phone can tell you why.
 */

const FLUSH_MS = 5_000;
const TOKEN_REFRESH_MS = 12 * 60 * 1000; // tokens live 15 minutes

export const BLE_AVAILABLE = MovesBle != null && process.env.EXPO_PUBLIC_PROXIMITY !== 'sim';

export type BleStatus = {
  /** Native radio state: off | on | unauthorized | unsupported | unknown, or idle. */
  radio: string;
  /** Got a token to advertise. */
  advertising: boolean;
  /** Distinct Moves phones heard since the radio started. */
  heard: number;
  /** Batches the server accepted. */
  synced: number;
  /** Friends' phones the server matched in the last batch. */
  together: number;
  error: string | null;
};

const IDLE: BleStatus = { radio: 'idle', advertising: false, heard: 0, synced: 0, together: 0, error: null };

export const useBleStatus = create<BleStatus>()(() => IDLE);

const setStatus = (p: Partial<BleStatus>) => useBleStatus.setState(p);

function useBleOptIn(): boolean {
  const fromSettings = useSettings((s) => s.me?.settings.ble_opt_in);
  const fromSession = useSession((s) => s.me?.settings.ble_opt_in);
  return Boolean(fromSettings ?? fromSession);
}

type Radio = { stop: () => void };

function startRadio(): Radio {
  const ble = MovesBle!;
  const seen = new Map<string, number>(); // uuid -> strongest rssi this window
  const heard = new Set<string>();
  let stopped = false;
  let flushing = false;

  const refreshToken = async () => {
    try {
      const { uuid } = await endpoints.proximity.token();
      if (stopped) return;
      ble.start(uuid);
      setStatus({ advertising: true, error: null });
    } catch (e) {
      setStatus({ advertising: false, error: `Token: ${errorMessage(e)}` });
    }
  };

  const flush = async () => {
    if (flushing || seen.size === 0 || AppState.currentState === 'background') return;
    const batch = [...seen].map(([token, rssi]) => ({ token, rssi }));
    seen.clear();
    flushing = true;
    try {
      const res = await endpoints.proximity.sightings(batch);
      setStatus({ synced: useBleStatus.getState().synced + 1, together: res.together, error: null });
      if (res.arrived.length > 0) toast("You're there. Marked you as arrived.");
    } catch (e) {
      setStatus({ error: `Sync: ${errorMessage(e)}` });
    } finally {
      flushing = false;
    }
  };

  const onSighting = ble.addListener('onSighting', ({ uuid, rssi }) => {
    seen.set(uuid, Math.max(rssi, seen.get(uuid) ?? -999));
    if (!heard.has(uuid)) {
      heard.add(uuid);
      setStatus({ heard: heard.size });
    }
  });
  const onState = ble.addListener('onState', ({ state }) => setStatus({ radio: state }));
  setStatus({ ...IDLE, radio: 'starting' });
  void refreshToken();
  const flushTimer = setInterval(() => void flush(), FLUSH_MS);
  const tokenTimer = setInterval(() => void refreshToken(), TOKEN_REFRESH_MS);

  return {
    stop: () => {
      stopped = true;
      clearInterval(flushTimer);
      clearInterval(tokenTimer);
      onSighting.remove();
      onState.remove();
      ble.stop();
      setStatus({ radio: 'idle', advertising: false });
    },
  };
}

/** Mount once in the root layout. Runs the radio only while the app is open. */
export function useBleProximity(): void {
  const userId = useSession((s) => s.userId);
  const optIn = useBleOptIn();

  useEffect(() => {
    if (!BLE_AVAILABLE || !userId || !optIn) return;
    // iOS can report 'unknown' at launch; only 'background' means closed.
    let radio: Radio | null = AppState.currentState !== 'background' ? startRadio() : null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !radio) radio = startRadio();
      if (state === 'background' && radio) {
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

/** One line for the Privacy screen. */
export function bleStatusLine(s: BleStatus, optIn: boolean): string {
  if (!BLE_AVAILABLE) return 'Simulated: this build has no Bluetooth radio.';
  if (!optIn) return 'Off.';
  if (s.error) return s.error;
  if (s.radio === 'unauthorized') return 'Bluetooth permission denied. Allow it in iOS Settings > Moves.';
  if (s.radio === 'off') return 'Bluetooth is off in Control Center.';
  const ad = s.advertising ? 'broadcasting' : 'getting a code…';
  return `Radio ${s.radio}, ${ad}. Heard ${s.heard} phone(s), ${s.synced} syncs, ${s.together} friend(s) with you.`;
}
