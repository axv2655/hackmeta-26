import { useEffect } from 'react';
import { AppState } from 'react-native';

import { BACKEND_URL } from './backend';
import { appEvents } from './events';
import { setServerNow } from './format';
import { useFriends } from './friends';
import { useSession } from './session';
import { useInbox, type MoveNotification } from './store/inbox';
import type { Envelope } from './types';

/**
 * One WebSocket per signed-in user (ARCHITECTURE.md 9.1): the server pushes
 * `{type, data, ts}`. Notifications become banners and the inbox reloads when
 * a Moment needs approval. Reconnects with backoff and when the app comes back to the foreground;
 * on every (re)connect it refetches what it may have missed.
 *
 * Every envelope also goes out on `appEvents` under its `type` (stores
 * subscribe themselves, so Move stores reload on `move.*` there), its `ts` keeps `serverNow()` in step with the demo
 * clock, and each (re)connect emits `'socket.open'`.
 */

function handle(event: Envelope) {
  if (typeof event.ts === 'string') setServerNow(event.ts);
  if (event.type === 'notification') {
    useInbox.getState().arrive(event.data as MoveNotification);
    const kind = (event.data as { type?: string }).type ?? '';
    if (kind.startsWith('friend_')) void useFriends.getState().load();
  }
  if (event.type === 'moment.approval_needed') void useInbox.getState().load();
  appEvents.emit(event.type, event.data);
}

export function useRealtime() {
  const userId = useSession((s) => s.userId);
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (!userId) return; // signed out: no socket
    let socket: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      clearTimeout(retry);
      const auth = token ? `&token=${encodeURIComponent(token)}` : '';
      const url = `${BACKEND_URL.replace(/^http/, 'ws')}/api/v1/ws?user_id=${encodeURIComponent(userId)}${auth}`;
      const ws = new WebSocket(url);
      socket = ws;
      ws.onopen = () => {
        attempt = 0;
        void useInbox.getState().load();
        appEvents.emit('socket.open');
      };
      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(String(e.data)) as Envelope;
          if (event && typeof event.type === 'string') handle(event);
        } catch {
          // Ignore anything that isn't an envelope.
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (closed || socket !== ws) return;
        retry = setTimeout(connect, Math.min(15000, 1000 * 2 ** attempt++));
      };
    };

    void useInbox.getState().load();
    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && (!socket || socket.readyState > WebSocket.OPEN)) connect();
    });
    return () => {
      closed = true;
      clearTimeout(retry);
      sub.remove();
      socket?.close();
    };
  }, [userId, token]);
}
