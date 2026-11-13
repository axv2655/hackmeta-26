import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { MuseBadge } from '@/components/common/MuseBadge';
import { StackScreen } from '@/components/common/StackScreen';
import { DemoMovesSection } from '@/components/muse/DemoMovesSection';
import { DemoMuseSection } from '@/components/muse/DemoMuseSection';
import { DemoPeopleSection } from '@/components/muse/DemoPeopleSection';
import { DemoTimeSection } from '@/components/muse/DemoTimeSection';
import { ApiError, errorMessage } from '@/lib/backend';
import { DEMO } from '@/lib/demo';
import { endpoints } from '@/lib/endpoints';
import { setServerNow } from '@/lib/format';
import { colors, spacing, type as typeScale } from '@/lib/theme';
import type { DemoState } from '@/lib/types';

type Screen =
  { kind: 'loading' } | { kind: 'off' } | { kind: 'error'; message: string } | { kind: 'ready'; state: DemoState };

/**
 * Demo Control: buttons for every step that depends on time, hardware or
 * another person, so the live demo never waits on any of them. Only in a
 * build with EXPO_PUBLIC_DEMO=1, and only when the server runs DEMO_MODE.
 */
export default function DemoScreen() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setScreen((s) => (s.kind === 'ready' ? s : { kind: 'loading' }));
    try {
      const state = await endpoints.demo.state();
      setServerNow(state.now);
      setScreen({ kind: 'ready', state });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setScreen({ kind: 'off' });
      else setScreen({ kind: 'error', message: errorMessage(e) });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (DEMO) void load();
  }, [load]);

  const onTime = useCallback((now: string, offsetMinutes: number) => {
    setServerNow(now);
    setScreen((s) =>
      s.kind === 'ready' ? { kind: 'ready', state: { ...s.state, now, offset_minutes: offsetMinutes } } : s,
    );
  }, []);

  if (!DEMO) {
    return (
      <StackScreen title="Demo Control">
        <EmptyState icon="lock" title="Demo Control is off in this build" body="Set EXPO_PUBLIC_DEMO=1 and restart." />
      </StackScreen>
    );
  }

  return (
    <StackScreen title="Demo Control">
      {screen.kind === 'loading' ? <LoadingState label="Checking demo mode" /> : null}
      {screen.kind === 'off' ? (
        <EmptyState
          icon="lock"
          title="Demo mode is off on the server (set DEMO_MODE=on)"
          action={{ label: 'Check again', onPress: () => void load() }}
        />
      ) : null}
      {screen.kind === 'error' ? <ErrorState message={screen.message} onRetry={() => void load()} /> : null}
      {screen.kind === 'ready' ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <View style={styles.status}>
            <MuseBadge source={screen.state.muse.live ? 'muse' : 'heuristic'} />
            <Text style={styles.statusText}>
              {screen.state.muse.live ? 'Muse is live' : 'Muse is on its heuristic (no key or budget spent)'}
            </Text>
          </View>
          <DemoTimeSection now={screen.state.now} offsetMinutes={screen.state.offset_minutes} onTime={onTime} />
          <DemoMuseSection />
          <DemoPeopleSection />
          <DemoMovesSection />
        </ScrollView>
      ) : null}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxxl },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  statusText: { ...typeScale.meta, flexShrink: 1 },
});
