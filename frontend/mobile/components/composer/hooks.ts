import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/backend';

export type QueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

/**
 * Runs `run` 250 ms after `key` stops changing (and on `retry`). Answers that
 * arrive after a newer key are dropped. The last good data stays while the
 * next request is in flight; disabled clears it.
 */
export function useDebouncedQuery<T>(key: string, run: () => Promise<T>, enabled: boolean, ms = 250): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      runRef.current().then(
        (d) => {
          if (!live) return;
          setData(d);
          setLoading(false);
        },
        (e) => {
          if (!live) return;
          setError(errorMessage(e));
          setLoading(false);
        },
      );
    }, ms);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, enabled, ms, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, retry };
}

/** Adds or removes `id`. Returns a new array. */
export function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
