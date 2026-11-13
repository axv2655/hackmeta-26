import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { useSession } from '@/lib/session';
import type { UserLite } from '@/lib/types';

export type DemoCast = {
  users: UserLite[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/** Everyone on the server except me: who can act in Demo Control. */
export function useDemoCast(): DemoCast {
  const meId = useSession((s) => s.userId);
  const [state, setState] = useState<Omit<DemoCast, 'reload'>>({ users: [], loading: true, error: null });

  const reload = useCallback(async () => {
    setState((c) => ({ ...c, loading: true, error: null }));
    try {
      const users = (await endpoints.demo.users()).filter((u) => u.id !== meId);
      setState({ users, loading: false, error: null });
    } catch (e) {
      setState((c) => ({ ...c, loading: false, error: errorMessage(e) }));
    }
  }, [meId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { ...state, reload };
}

/** Up to `n` cast members, the preferred seeded ids first. */
export function pickCast(users: UserLite[], preferred: string[], n: number): UserLite[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  const first = preferred.map((id) => byId.get(id)).filter((u): u is UserLite => Boolean(u));
  const rest = users.filter((u) => !preferred.includes(u.id));
  return [...first, ...rest].slice(0, n);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
