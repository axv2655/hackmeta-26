import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { useSession } from '@/lib/session';
import type { MyListRow, Taste } from '@/lib/types';

type Load<T> = { status: 'loading' | 'ready' | 'error'; data: T; error: string | null };

/** Muse's taste summary (null when it has none yet) and the top of "Your list", refreshed on focus. */
export function useProfileExtras() {
  const userId = useSession((s) => s.userId);
  const [taste, setTaste] = useState<Taste | null>(null);
  const [list, setList] = useState<Load<MyListRow[]>>({ status: 'loading', data: [], error: null });

  const loadList = useCallback(async () => {
    setList((prev) => ({ ...prev, status: prev.data.length ? 'ready' : 'loading', error: null }));
    try {
      const rows = await endpoints.leaderboards.myList();
      setList({ status: 'ready', data: rows.slice(0, 3), error: null });
    } catch (e) {
      setList((prev) => ({ ...prev, status: 'error', error: errorMessage(e) }));
    }
  }, []);

  const loadTaste = useCallback(async () => {
    try {
      setTaste(await endpoints.muse.taste());
    } catch {
      // The taste card is optional: hide it when Muse's profile can't be read.
      setTaste(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      void loadTaste();
      void loadList();
    }, [userId, loadTaste, loadList]),
  );

  return { taste, list, reloadList: loadList };
}
