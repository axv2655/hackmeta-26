import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar/legacy';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { errorMessage } from './backend';
import { sourceNames, SYNC_SPAN_MS, toBusyBlocks, toLocalEvents, type LocalEvent } from './calendarBlocks';
import { endpoints } from './endpoints';
import { onLogout, useSession } from './session';
import { useSettings } from './settings';
import { toast } from './toast';

/**
 * The phone's own calendar (ARCHITECTURE.md 10.6, 12.1). On iOS this is the
 * Calendar app, which already includes any Google, Outlook or iCloud account
 * added in iOS Settings, so no Google sign-in is needed.
 *
 * Privacy: only merged busy blocks (start, end) are sent, via
 * `PUT /calendar/busy`. Titles stay here in `local`, to label "Your day" on
 * this phone. Reading needs both the OS permission and the Privacy toggle
 * (`calendar_opt_in`); "connected" is remembered per user on this phone, so a
 * seeded demo account never syncs a real calendar until someone taps Connect.
 * Muse then reads the free windows server-side for Flares.
 */

export type CalendarPermission = 'unknown' | 'granted' | 'denied' | 'unavailable';
type SyncStatus = 'idle' | 'syncing' | 'ready' | 'error';

type CalendarState = {
  permission: CalendarPermission;
  canAskAgain: boolean;
  /** This user tapped Connect on this phone. */
  connected: boolean;
  status: SyncStatus;
  error: string | null;
  lastSyncedAt: number | null;
  blockCount: number;
  /** Accounts read from, e.g. ["iCloud", "Gmail"]. */
  sources: string[];
  /** Device events with titles. Never sent anywhere. */
  local: LocalEvent[];
  /** Loads the remembered "connected" flag for the signed-in user and reads the permission. */
  hydrate: () => Promise<void>;
  /** Asks the OS, turns the Privacy toggle on and syncs. Resolves the permission. */
  connect: () => Promise<CalendarPermission>;
  /**
   * Stops syncing, removes this phone's busy blocks and turns the Privacy toggle
   * off (the server drops the blocks on opt-out too). `optOut: false` only stops
   * here, for when the toggle was already turned off elsewhere.
   */
  disconnect: (opts?: { optOut?: boolean }) => Promise<void>;
  /** Reads the next 24 h and replaces the server's busy blocks. No-op unless connected and allowed. */
  sync: () => Promise<void>;
};

/** How often an open app re-syncs. Muse's flare scan runs every minute on the server. */
const SYNC_MS = 10 * 60 * 1000;
const keyFor = (userId: string) => `moves.calendar.connected.${userId}`;
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

let syncing: Promise<void> | null = null;

async function readPermission(): Promise<{ permission: CalendarPermission; canAskAgain: boolean }> {
  if (!supported) return { permission: 'unavailable', canAskAgain: false };
  try {
    const perm = await Calendar.getCalendarPermissionsAsync();
    return { permission: perm.status === 'granted' ? 'granted' : perm.status === 'denied' ? 'denied' : 'unknown', canAskAgain: perm.canAskAgain };
  } catch {
    return { permission: 'unavailable', canAskAgain: false };
  }
}

async function rememberConnected(on: boolean): Promise<void> {
  const { userId } = useSession.getState();
  if (!userId) return;
  try {
    if (on) await AsyncStorage.setItem(keyFor(userId), '1');
    else await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // Storage is a convenience: worst case the user taps Connect again.
  }
}

/** The calendar opt-in as the app knows it (settings screen first, then the session). */
function optedIn(): boolean {
  const me = useSettings.getState().me ?? useSession.getState().me;
  return Boolean(me?.settings.calendar_opt_in);
}

/** Saves `calendar_opt_in`, through the settings store when it is loaded. */
async function setOptIn(on: boolean): Promise<boolean> {
  if (useSettings.getState().me) return useSettings.getState().patch({ calendar_opt_in: on });
  try {
    await endpoints.me.settings({ calendar_opt_in: on });
    await useSession.getState().refreshMe();
    return true;
  } catch (e) {
    toast(errorMessage(e));
    return false;
  }
}

async function readDevice(now: number) {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const ids = calendars.map((c) => c.id);
  const events = ids.length ? await Calendar.getEventsAsync(ids, new Date(now), new Date(now + SYNC_SPAN_MS)) : [];
  return { calendars, events };
}

export const useDeviceCalendar = create<CalendarState>()((set, get) => ({
  permission: 'unknown',
  canAskAgain: true,
  connected: false,
  status: 'idle',
  error: null,
  lastSyncedAt: null,
  blockCount: 0,
  sources: [],
  local: [],
  hydrate: async () => {
    const { userId } = useSession.getState();
    let connected = false;
    try {
      connected = Boolean(userId) && (await AsyncStorage.getItem(keyFor(userId))) === '1';
    } catch {
      connected = false;
    }
    set({ connected, ...(await readPermission()) });
  },
  connect: async () => {
    if (!supported) {
      set({ permission: 'unavailable' });
      return 'unavailable';
    }
    let perm = await Calendar.getCalendarPermissionsAsync().catch(() => null);
    if (perm && perm.status !== 'granted' && perm.canAskAgain) {
      perm = await Calendar.requestCalendarPermissionsAsync().catch(() => perm);
    }
    if (!perm || perm.status !== 'granted') {
      set({ permission: 'denied', canAskAgain: perm?.canAskAgain ?? false });
      return 'denied';
    }
    set({ permission: 'granted', canAskAgain: true, connected: true });
    await rememberConnected(true);
    if (!optedIn()) await setOptIn(true);
    await get().sync();
    return 'granted';
  },
  disconnect: async ({ optOut = true } = {}) => {
    set({ connected: false, status: 'idle', error: null, local: [], blockCount: 0, sources: [] });
    await rememberConnected(false);
    if (optOut) await setOptIn(false); // the server drops this user's phone blocks
  },
  sync: async () => {
    if (syncing) return syncing;
    const { connected, permission } = get();
    if (!connected || permission !== 'granted' || !optedIn()) return;
    syncing = (async () => {
      set({ status: 'syncing', error: null });
      try {
        const now = Date.now();
        const { calendars, events } = await readDevice(now);
        const blocks = toBusyBlocks(events, now);
        await endpoints.calendar.busy(blocks);
        set({
          status: 'ready',
          lastSyncedAt: Date.now(),
          blockCount: blocks.length,
          sources: sourceNames(calendars),
          local: toLocalEvents(events),
        });
      } catch (e) {
        set({ status: 'error', error: errorMessage(e) });
      } finally {
        syncing = null;
      }
    })();
    return syncing;
  },
}));

/**
 * Keeps the server's busy blocks fresh while the app is open: on sign-in, on
 * returning to the foreground (the user may have just added an event), and
 * every 10 minutes. Mounted once in the root layout.
 */
export function useCalendarSync(): void {
  const userId = useSession((s) => s.userId);
  const connected = useDeviceCalendar((s) => s.connected);
  const optIn = useSession((s) => s.me?.settings.calendar_opt_in ?? null);

  useEffect(() => {
    if (userId) void useDeviceCalendar.getState().hydrate();
  }, [userId]);

  // Turned off on another screen or device: stop reading here too.
  useEffect(() => {
    if (connected && optIn === false) void useDeviceCalendar.getState().disconnect({ optOut: false });
  }, [connected, optIn]);

  const allowed = optIn === true;
  useEffect(() => {
    if (!userId || !connected || !allowed) return;
    const run = async () => {
      if (AppState.currentState !== 'active') return;
      const store = useDeviceCalendar.getState();
      // Re-read the permission: it may have been revoked in iOS Settings.
      const perm = await readPermission();
      useDeviceCalendar.setState(perm);
      await store.sync();
    };
    void run();
    const timer = setInterval(() => void run(), SYNC_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, connected, allowed]);
}

onLogout(() => {
  useDeviceCalendar.setState({
    connected: false,
    status: 'idle',
    error: null,
    lastSyncedAt: null,
    blockCount: 0,
    sources: [],
    local: [],
  });
});
