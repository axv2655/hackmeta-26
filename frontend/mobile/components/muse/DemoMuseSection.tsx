import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import type { DemoMuseStats, DemoSuggestionResult } from '@/lib/types';

import { DemoButton } from './DemoButton';
import { DemoSection } from './DemoSection';
import { MuseStatsCard } from './MuseStatsCard';
import { rememberSuggestion } from './demoActions';

type Stats = { stats: DemoMuseStats | null; loading: boolean; error: string | null };

/** Opens the suggestion a scan produced, or explains why there is none. */
export function useOpenSuggestion() {
  const router = useRouter();
  return useCallback(
    (res: DemoSuggestionResult, none: string): string | void => {
      if (!res.suggestion) return none;
      rememberSuggestion(res.suggestion);
      router.push(`/suggestion/${encodeURIComponent(res.suggestion.id)}` as Href);
    },
    [router],
  );
}

/** The Muse triggers (calendar gap, free time, fading crew) and the live stats card. */
export function DemoMuseSection() {
  const openSuggestion = useOpenSuggestion();
  const [s, setS] = useState<Stats>({ stats: null, loading: true, error: null });

  const loadStats = useCallback(async () => {
    setS((cur) => ({ ...cur, loading: true }));
    try {
      setS({ stats: await endpoints.demo.museStats(), loading: false, error: null });
    } catch (e) {
      setS((cur) => ({ ...cur, loading: false, error: errorMessage(e) }));
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const scan = async (call: () => Promise<DemoSuggestionResult>, none: string) => {
    try {
      return openSuggestion(await call(), none);
    } finally {
      void loadStats();
    }
  };

  return (
    <DemoSection title="Muse" note="Each scan opens the suggestion Muse made, with its reasoning.">
      <DemoButton
        label="Fire flare scan for me"
        sub="Puts a 45 min gap before a class on my calendar"
        icon="flame"
        run={() => scan(() => endpoints.demo.flareScan(), 'Muse found no Flare to suggest')}
      />
      <DemoButton
        label="Fire free-time"
        sub="Clears my calendar so friends who are free line up"
        icon="calendar"
        run={() => scan(() => endpoints.demo.freeTime(), 'Muse found nothing for free time')}
      />
      <DemoButton
        label="Fire revive scan"
        sub="Looks for a crew that hasn't hung out lately"
        icon="users"
        run={() => scan(() => endpoints.demo.reviveScan(), 'No fading crew right now')}
      />
      <MuseStatsCard stats={s.stats} loading={s.loading} error={s.error} onRefresh={() => void loadStats()} />
    </DemoSection>
  );
}

export default DemoMuseSection;
