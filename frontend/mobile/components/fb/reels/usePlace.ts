import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { nearHere } from '@/lib/reels';
import type { ReelPlace } from '@/lib/types';

export type PlaceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; place: ReelPlace };

/**
 * `GET /reels/{id}/place` for the open sheet. A late answer for a reel the
 * viewer already closed or swapped is dropped.
 */
export function usePlace(reelId: string | null): { state: PlaceState; reload: () => void } {
  const [state, setState] = useState<PlaceState>({ status: 'idle' });
  const latest = useRef(0);

  const reload = useCallback(() => {
    const ticket = latest.current + 1;
    latest.current = ticket;
    if (!reelId) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    endpoints.reels.place(reelId, nearHere()).then(
      (place) => {
        if (latest.current === ticket) setState({ status: 'ready', place });
      },
      (e: unknown) => {
        if (latest.current === ticket) setState({ status: 'error', error: errorMessage(e) });
      },
    );
  }, [reelId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { state, reload };
}
