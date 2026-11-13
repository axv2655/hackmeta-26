import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { toast } from '@/lib/toast';
import type { Moment } from '@/lib/types';

export type MomentsStatus = 'loading' | 'ready' | 'error';

/** The Moment with `userId`'s tag answered and its status recomputed. */
function answered(m: Moment, userId: string, approve: boolean): Moment {
  const tags = m.tags.map((t) => (t.user.id === userId ? { ...t, approved: approve } : t));
  return { ...m, tags, status: tags.every((t) => t.approved === true) ? 'approved' : 'pending' };
}

/** `GET /moves/{id}/moments`, kept fresh by `moment.added`, plus tag approval. */
export function useMoments(moveId: string, enabled = true) {
  const [items, setItems] = useState<Moment[]>([]);
  const [status, setStatus] = useState<MomentsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const itemsRef = useRef<Moment[]>([]);
  itemsRef.current = items;

  const load = useCallback(async () => {
    if (!moveId) return;
    if (!loaded.current) setStatus('loading');
    try {
      const next = await endpoints.moments.list(moveId);
      loaded.current = true;
      setItems(next);
      setStatus('ready');
      setError(null);
    } catch (e) {
      if (loaded.current) return;
      setError(errorMessage(e));
      setStatus('error');
    }
  }, [moveId]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const reload = (data: unknown) => {
      const id = (data as { move_id?: unknown } | undefined)?.move_id;
      if (id === undefined || id === moveId) void load();
    };
    const offs = ['moment.added', 'moment.approval_needed', 'socket.open'].map((t) => appEvents.on(t, reload));
    return () => offs.forEach((off) => off());
  }, [enabled, load, moveId]);

  const approve = useCallback(async (momentId: string, userId: string, yes: boolean) => {
    const before = itemsRef.current;
    setItems(before.map((m) => (m.id === momentId ? answered(m, userId, yes) : m)));
    try {
      const fresh = await endpoints.moments.approve(momentId, yes);
      setItems((cur) => cur.map((m) => (m.id === momentId ? fresh : m)));
      if (!yes) toast('Declined. It stays hidden.');
      else toast(fresh.status === 'approved' ? 'Approved. Friends can see it now.' : 'Approved. Waiting on the others.');
    } catch (e) {
      setItems(before);
      toast(errorMessage(e));
    }
  }, []);

  return { items, status, error, load, approve };
}
