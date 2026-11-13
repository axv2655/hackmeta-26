import { useEffect } from 'react';
import { AppState } from 'react-native';

import { BACKEND_URL } from './backend';
import { useFriends } from './friends';
import { useLive } from './live';
import { useSession } from './session';
import { useInbox, type MoveNotification } from './store/inbox';

/**
 * One WebSocket per signed-in user (ARCHITECTURE.md 9.1): the server pushes
 * `{type, data, ts}`. Notifications become banners; Move changes reload the
 * map. Reconnects with backoff and when the app comes back to the foreground;
 * on every (re)connect it refetches what it may have missed.
 */
type Envelope = { type: string; data: unknown; ts: string };

const MOVE_EVENTS = new Set(['move.created', 'move.updated', 'move.ended', 'participant.changed', 'moment.added']);

let reloadTimer: ReturnType<typeof setTimeout> | undefined;
function reloadMovesSoon() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void useLive.getState().load(), 250);
}

function handle(event: Envelope) {
  if (event.type === 'notification') {
    useInbox.getState().arrive(event.data as MoveNotification);
    const kind = (event.data as { type?: string }).type ?? '';
    if (kind.startsWith('friend_')) void useFriends.getState().load();
  }
  if (MOVE_EVENTS.has(event.type) || event.type === 'notification') reloadMovesSoon();
}

export function useRealtime() {
  const userId = useSession((s) => s.userId);

  useEffect(() => {
    if (!userId) return; // signed out: no socket
    let socket: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      clearTimeout(retry);
      const url = `${BACKEND_URL.replace(/^http/, 'ws')}/api/v1/ws?user_id=${encodeURIComponent(userId)}`;
      const ws = new WebSocket(url);
      socket = ws;
      ws.onopen = () => {
        attempt = 0;
        void useInbox.getState().load();
        reloadMovesSoon();
      };
      ws.onmessage = (e) => {
        try {
          handle(JSON.parse(String(e.data)) as Envelope);
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
  }, [userId]);
}
