import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { api, postJson, useSession } from './session';
import { useMyMoves } from './store/moves';

/**
 * Phone push (APNs). Once someone is signed in, ask for notification
 * permission, send this phone's APNs token to `POST /me/push-tokens`, and
 * drop it on logout. In the foreground the in-app banner shows notifications
 * instead (`lib/realtime.ts`); tapping a push opens its Move on the map.
 *
 * Development-signed builds get sandbox tokens, so `sandbox` is true until the
 * app ships with a distribution profile.
 */

const SANDBOX = process.env.EXPO_PUBLIC_APNS_SANDBOX !== '0';

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
  if (Platform.OS !== 'ios') return;
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
  void api(`/me/push-tokens/${registered}`, { method: 'DELETE' }).catch(() => undefined);
  registered = null;
}

/** Register while signed in, and open the Move when a push is tapped. */
export function usePush(): void {
  const router = useRouter();
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    if (userId) void register();
  }, [userId]);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const moveId = response?.notification.request.content.data?.move_id;
      if (typeof moveId !== 'string') return;
      useMyMoves.getState().focus(moveId);
      router.navigate('/moves');
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
