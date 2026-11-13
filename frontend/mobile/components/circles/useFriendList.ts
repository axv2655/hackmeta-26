import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import type { UserLite } from '@/lib/types';

export type FriendList = {
  friends: UserLite[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  reload: () => void;
};

/** `GET /friends` as plain users, sorted by name, for Circle member pickers. */
export function useFriendList(): FriendList {
  const [friends, setFriends] = useState<UserLite[]>([]);
  const [status, setStatus] = useState<FriendList['status']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    endpoints.friends
      .list()
      .then((rows) => {
        if (!alive) return;
        setFriends(rows.map((r) => r.user).sort((a, b) => a.name.localeCompare(b.name)));
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(errorMessage(e));
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { friends, status, error, reload };
}
