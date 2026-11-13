import { useCallback, useEffect, useState } from 'react';

import { ApiError, errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import type { Profile } from '@/lib/types';

export type ProfileStatus = 'loading' | 'ready' | 'missing' | 'error';

export type ProfileState = {
  profile: Profile | null;
  status: ProfileStatus;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * `GET /users/{id}`. A 404 (unknown, or blocked either way) is `missing`,
 * not an error. A failed reload keeps the profile we already show.
 */
export function useProfile(id: string | undefined): ProfileState {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) {
      setStatus('missing');
      return;
    }
    try {
      const next = await endpoints.friends.profile(id);
      setProfile(next);
      setStatus('ready');
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setProfile(null);
        setStatus('missing');
        return;
      }
      setError(errorMessage(e));
      setStatus((s) => (s === 'ready' ? s : 'error'));
    }
  }, [id]);

  useEffect(() => {
    setProfile(null);
    setStatus('loading');
    void reload();
  }, [reload]);

  return { profile, status, error, reload };
}
