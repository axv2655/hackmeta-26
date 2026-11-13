import { Alert, StyleSheet, Text, View } from 'react-native';

import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { parseIso } from '@/lib/format';
import { useSuggestions } from '@/lib/suggestions';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

import { DemoButton } from './DemoButton';
import { DemoSection } from './DemoSection';

export type DemoTimeSectionProps = {
  now: string | null;
  offsetMinutes: number;
  /** Called with the server's new time after every change. */
  onTime: (now: string, offsetMinutes: number) => void;
};

function clockLabel(iso: string | null): string {
  if (!iso) return '--';
  const t = parseIso(iso);
  if (!Number.isFinite(t)) return '--';
  return new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function offsetLabel(minutes: number): string {
  if (!minutes) return 'Real time';
  const sign = minutes > 0 ? '+' : '-';
  const m = Math.abs(Math.round(minutes));
  return m >= 60 ? `${sign}${Math.floor(m / 60)} h ${m % 60} min` : `${sign}${m} min`;
}

function confirmReset(): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      'Reset the demo world?',
      'Time goes back to now, example Moves come back and pending suggestions expire.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Reset', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

/** Time shifts (the server's DemoClock) and the soft world reset. */
export function DemoTimeSection({ now, offsetMinutes, onTime }: DemoTimeSectionProps) {
  const shift = async (minutes: number) => {
    const res = await endpoints.demo.time({ offset_minutes: minutes });
    onTime(res.now, res.offset_minutes);
    appEvents.emit('moves.changed');
    return `Server time is now ${clockLabel(res.now)}`;
  };

  const resetTime = async () => {
    const res = await endpoints.demo.time({ reset: true });
    onTime(res.now, res.offset_minutes);
    appEvents.emit('moves.changed');
    return 'Back to real time';
  };

  const resetWorld = async () => {
    if (!(await confirmReset())) return;
    const res = await endpoints.demo.reset();
    onTime(res.now, 0);
    appEvents.emit('moves.changed');
    void useSuggestions.getState().load();
    return `World reset · ${res.refreshed_moves} Moves back, ${res.expired_suggestions} suggestions cleared`;
  };

  return (
    <>
      <DemoSection title="Time">
        <View style={styles.clock}>
          <Text style={styles.clockText}>{clockLabel(now)}</Text>
          <Text style={styles.offset}>{offsetLabel(offsetMinutes)}</Text>
        </View>
        <DemoButton label="+10 min" sub="A Flare's fill window closes" icon="clock" run={() => shift(10)} />
        <DemoButton label="+30 min" sub="Moves age, Muse cards expire" icon="clock" run={() => shift(30)} />
        <DemoButton label="+60 min" sub="Jump to the next part of the day" icon="clock" run={() => shift(60)} />
        <DemoButton label="Reset time" icon="history" run={resetTime} />
      </DemoSection>
      <DemoSection title="World">
        <DemoButton
          label="Reset world"
          sub="Soft reset. Never drops data."
          icon="trash"
          run={resetWorld}
        />
      </DemoSection>
    </>
  );
}

const styles = StyleSheet.create({
  clock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clockText: { ...typeScale.eventTitle },
  offset: { ...typeScale.label, color: colors.textSecondary },
});

export default DemoTimeSection;
