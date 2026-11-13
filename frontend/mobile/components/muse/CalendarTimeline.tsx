import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { parseIso, serverNow, timeRange } from '@/lib/format';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { CalendarDay, CalendarEvent, FreeWindow } from '@/lib/types';

type Row = { kind: 'event'; at: number; event: CalendarEvent } | { kind: 'free'; at: number; window: FreeWindow };

/** Events and the free window in time order. */
export function timelineRows(day: CalendarDay): Row[] {
  const events: Row[] = day.events.map((event) => ({ kind: 'event', at: parseIso(event.starts_at), event }));
  const free: Row[] = day.free_window
    ? [{ kind: 'free', at: parseIso(day.free_window.start), window: day.free_window }]
    : [];
  return [...events, ...free].sort((a, b) => a.at - b.at);
}

/** The day as a list: busy blocks (title or "Busy") with the free window highlighted. */
export function CalendarTimeline({ day }: { day: CalendarDay }) {
  return (
    <View style={styles.list}>
      {timelineRows(day).map((row) =>
        row.kind === 'event' ? (
          <EventRow key={row.event.id} event={row.event} />
        ) : (
          <FreeRow key="free" window={row.window} />
        ),
      )}
    </View>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const now = serverNow();
  const past = parseIso(event.ends_at) < now;
  const current = !past && parseIso(event.starts_at) <= now;
  return (
    <View style={[styles.row, past && styles.past]}>
      <Text style={styles.time}>{timeRange(event.starts_at, event.ends_at)}</Text>
      <View style={[styles.block, current && styles.blockNow]}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title || 'Busy'}
        </Text>
        {current ? <Text style={styles.sub}>Happening now</Text> : null}
        {event.location && event.location !== 'demo' ? (
          <Text style={styles.sub} numberOfLines={1}>
            {event.location}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function FreeRow({ window }: { window: FreeWindow }) {
  return (
    <View style={styles.row}>
      <Text style={styles.time}>{timeRange(window.start, window.end)}</Text>
      <View style={[styles.block, styles.free]}>
        <View style={styles.freeHead}>
          <Icon name="sparkles" size={14} color={colors.chipSelectedText} />
          <Text style={styles.freeTitle}>
            Free {timeRange(window.start, window.end)} · {window.minutes} min
          </Text>
        </View>
        <Text style={styles.sub}>Muse looks here for Flares</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  past: { opacity: 0.5 },
  time: { ...typeScale.meta, width: 112, paddingTop: spacing.md },
  block: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  blockNow: { borderLeftWidth: 3, borderLeftColor: colors.text },
  title: { ...typeScale.name },
  sub: { ...typeScale.meta },
  free: { backgroundColor: colors.chipSelectedBg },
  freeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  freeTitle: { ...typeScale.name, color: colors.chipSelectedText, flexShrink: 1 },
});

export default CalendarTimeline;
