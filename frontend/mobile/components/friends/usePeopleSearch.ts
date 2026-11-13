import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import { searchPeople, type Person } from '@/lib/friends';

const SETTLE_MS = 250;

export type PeopleSearch = {
  results: Person[] | null;
  searching: boolean;
  error: string | null;
  retry: () => void;
};

/**
 * Debounced `GET /users/search` for `q` (already trimmed). Results keep the
 * relation from the response; rows read the live relation from `useFriends`,
 * so actions on a result never snap back.
 */
export function usePeopleSearch(q: string): PeopleSearch {
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!q) {
      setResults(null);
      setError(null);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPeople(q);
        if (!live) return;
        setResults(found);
        setError(null);
      } catch (e) {
        if (live) setError(errorMessage(e));
      } finally {
        if (live) setSearching(false);
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { results, searching, error, retry };
}
