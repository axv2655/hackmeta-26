import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { appEvents } from './events';
import { routeFor } from './nav';
import { api, del, onLogout, postJson, useSession } from './session';

/**
 * Phone push (APNs). The permission prompt waits until the user has done
 * something worth being told about (their first Move change this session) or
 * 30 s after sign-in, whichever comes first, and never blocks the app. The
 * APNs token goes to `POST /me/push-tokens` and is dropped on logout. In the
 * foreground the in-app banner shows notifications instead (`lib/realtime.ts`);
 * tapping a push opens wherever its data points (`routeFor`).
 *
 * Development-signed builds get sandbox tokens, so `sandbox` is true until the
 * app ships with a distribution profile.
 */

const SANDBOX = process.env.EXPO_PUBLIC_APNS_SANDBOX !== '0';
const ASK_AFTER_MS = 30_000;

// The socket already shows an in-app banner while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registered: string | null = null;

async function register(): Promise<void> {
  if (Platform.OS !== 'ios' || registered) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return; // in-app notifications still work
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== 'string' || !data) return;
    await api('/me/push-tokens', postJson({ token: data, sandbox: SANDBOX }));
    registered = data;
  } catch {
    // Simulator, no network, or a build without the push entitlement.
  }
}

/** Stop pushing to this phone. Call before clearing the session. */
export function unregisterPush(): void {
  if (!registered) return;
  void api(`/me/push-tokens/${encodeURIComponent(registered)}`, del()).catch(() => undefined);
  registered = null;
}

// Whoever logs out, the token belongs to the old account. The DELETE above
// needs the old user id, so the Menu calls unregisterPush() first; this only
// forgets the token if something else logged out (a 401).
onLogout(() => {
  registered = null;
});

function asRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

/** The notification payload, wherever APNs put it (`data.body` or `data`), plus its type. */
function payloadOf(response: Notifications.NotificationResponse): { data?: Record<string, string>; type?: string } {
  const raw = response.notification.request.content.data as Record<string, unknown> | undefined;
  if (!raw) return {};
  const body = typeof raw.body === 'string' ? safeParse(raw.body) : raw.body;
  const inner = body && typeof body === 'object' ? (body as Record<string, unknown>) : raw;
  const nested = asRecord(inner.data);
  const data = nested && Object.keys(nested).length ? nested : asRecord(inner);
  const type = typeof inner.type === 'string' ? inner.type : typeof raw.type === 'string' ? raw.type : undefined;
  return { data, type };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

/** Ask for push after the first Move change or 30 s after sign-in; open taps. */
export function usePush(): void {
  const router = useRouter();
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    if (!userId) return;
    let done = false;
    const ask = () => {
      if (done) return;
      done = true;
      void register();
    };
    const timer = setTimeout(ask, ASK_AFTER_MS);
    const off = appEvents.on('moves.changed', ask);
    return () => {
      done = true;
      clearTimeout(timer);
      off();
    };
  }, [userId]);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || !useSession.getState().userId) return;
      const { data, type } = payloadOf(response);
      const href = routeFor(data, type);
      if (href) router.push(href);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
