import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { CalendarTimeline } from '@/components/muse/CalendarTimeline';
import { PhoneCalendarCard } from '@/components/muse/PhoneCalendarCard';
import { errorMessage } from '@/lib/backend';
import { useDeviceCalendar } from '@/lib/calendar';
import { localTitleFor } from '@/lib/calendarBlocks';
import { endpoints } from '@/lib/endpoints';
import { timeRange } from '@/lib/format';
import { colors, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { CalendarDay } from '@/lib/types';

type State = { day: CalendarDay | null; error: string | null; loading: boolean; refreshing: boolean };

/**
 * "Your day": the calendar Muse reads to find free windows for Flares. Sample
 * events from the demo world plus, once connected, the phone's own busy blocks
 * (labelled here with the phone's titles, which never leave it).
 */
export default function CalendarScreen() {
  const [state, setState] = useState<State>({ day: null, error: null, loading: true, refreshing: false });
  const connected = useDeviceCalendar((s) => s.connected);
  const local = useDeviceCalendar((s) => s.local);
  const lastSyncedAt = useDeviceCalendar((s) => s.lastSyncedAt);

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

  // A background sync (foreground, timer) landed: show the new blocks.
  useEffect(() => {
    if (lastSyncedAt) void load(true);
  }, [lastSyncedAt, load]);

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true }));
    await useDeviceCalendar.getState().sync();
    await load(true);
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        >
          <PhoneCalendarCard onSynced={() => void load(true)} />
          {day.events.length ? (
            <CalendarTimeline day={day} titleFor={(e) => localTitleFor(local, e.starts_at, e.ends_at)} />
          ) : (
            <EmptyState icon="calendar" title="Nothing on your calendar" body={freeLine} />
          )}
          <Text style={styles.note}>
            {connected
              ? 'Only busy times are shared with Muse. Titles stay on your phone.'
              : 'Sample calendar. Connect yours above; only busy times are ever shared.'}
          </Text>
        </ScrollView>
      ) : null}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: colors.white, paddingBottom: spacing.xxl },
  note: { ...typeScale.meta, textAlign: 'center', paddingHorizontal: spacing.xxl, paddingTop: spacing.lg },
});
