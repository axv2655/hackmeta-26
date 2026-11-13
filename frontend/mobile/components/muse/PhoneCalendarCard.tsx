import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { connectCalendar } from '@/components/settings/CalendarToggle';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useDeviceCalendar } from '@/lib/calendar';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

function syncedLine(sources: string[], blocks: number, at: number | null): string {
  const from = sources.length ? `From ${sources.slice(0, 3).join(', ')}` : 'From your phone';
  const count = `${blocks} busy ${blocks === 1 ? 'block' : 'blocks'} in the next day`;
  if (!at) return `${from} · ${count}`;
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  return `${from} · ${count} · synced ${mins < 1 ? 'just now' : `${mins} min ago`}`;
}

/**
 * Top of "Your day": connect the phone's calendar, or show what is synced.
 * `onSynced` reloads the day after a sync so the new blocks show at once.
 */
export function PhoneCalendarCard({ onSynced }: { onSynced: () => void }) {
  const cal = useDeviceCalendar();
  const [busy, setBusy] = useState(false);

  if (cal.permission === 'unavailable') return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
    onSynced();
  };

  if (!cal.connected) {
    return (
      <View style={styles.card}>
        <View style={styles.head}>
          <Icon name="calendar" size={18} color={colors.tintText} />
          <Text style={styles.title}>Use your real calendar</Text>
        </View>
        <Text style={styles.body}>
          Muse reads when you&apos;re busy from your phone&apos;s Calendar app, including Google or Outlook accounts
          added there, and suggests Flares for the gaps. Only start and end times leave your phone.
        </Text>
        <Button title={busy ? 'Connecting...' : 'Connect calendar'} size="sm" disabled={busy} onPress={() => void run(connectCalendar)} />
      </View>
    );
  }

  const syncing = cal.status === 'syncing';
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Icon name="calendar" size={18} color={colors.tintText} />
        <Text style={styles.title}>Phone calendar connected</Text>
        {syncing ? <ActivityIndicator size="small" /> : null}
      </View>
      <Text style={styles.body}>
        {cal.status === 'error' && cal.error
          ? `Couldn't sync: ${cal.error}`
          : cal.permission === 'denied'
            ? "Calendar access is off in your phone's Settings."
            : syncedLine(cal.sources, cal.blockCount, cal.lastSyncedAt)}
      </Text>
      <View style={styles.actions}>
        <Button
          title="Sync now"
          size="sm"
          variant="tinted"
          disabled={busy || syncing}
          onPress={() => void run(() => useDeviceCalendar.getState().sync())}
        />
        <Button
          title="Disconnect"
          size="sm"
          variant="secondary"
          disabled={busy}
          onPress={() => void run(() => useDeviceCalendar.getState().disconnect())}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.tintBg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typeScale.name, color: colors.tintText, flexShrink: 1 },
  body: { ...typeScale.meta, color: colors.tintText },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

export default PhoneCalendarCard;
