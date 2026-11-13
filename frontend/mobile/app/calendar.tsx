import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { CalendarTimeline } from '@/components/muse/CalendarTimeline';
import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { timeRange } from '@/lib/format';
import { colors, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { CalendarDay } from '@/lib/types';

type State = { day: CalendarDay | null; error: string | null; loading: boolean; refreshing: boolean };

/** "Your day": the mock calendar Muse reads to find free windows for Flares. */
export default function CalendarScreen() {
  const [state, setState] = useState<State>({ day: null, error: null, loading: true, refreshing: false });

  const load = useCallback(async (refreshing = false) => {
    setState((s) => ({ ...s, error: null, loading: !refreshing && !s.day, refreshing }));
    try {
      const day = await endpoints.calendar.get();
      setState({ day, error: null, loading: false, refreshing: false });
    } catch (e) {
      if (refreshing) toast(errorMessage(e));
      setState((s) => ({ ...s, error: errorMessage(e), loading: false, refreshing: false }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { day, error, loading, refreshing } = state;
  const freeLine = day?.free_window
    ? `Free ${timeRange(day.free_window.start, day.free_window.end)} · ${day.free_window.minutes} min`
    : undefined;

  return (
    <StackScreen title="Your day">
      {loading ? <LoadingState label="Loading your day" /> : null}
      {!loading && error && !day ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {day ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {day.events.length ? (
            <CalendarTimeline day={day} />
          ) : (
            <EmptyState icon="calendar" title="Nothing on your calendar" body={freeLine} />
          )}
          <Text style={styles.note}>Mock calendar. Busy blocks only, titles never leave your phone.</Text>
        </ScrollView>
      ) : null}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: colors.white, paddingBottom: spacing.xxl },
  note: { ...typeScale.meta, textAlign: 'center', paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
});
