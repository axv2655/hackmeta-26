import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useDeviceCalendar } from '@/lib/calendar';
import { useSettings } from '@/lib/settings';
import { spacing, type as typeScale } from '@/lib/theme';

import { ToggleRow } from './SettingsRow';

function openPhoneSettings(): void {
  Linking.openSettings().catch(() => Alert.alert('Open Settings', "Find Moves in your phone's Settings app."));
}

/** Connects the phone's calendar; explains what to do when the OS says no. */
export async function connectCalendar(): Promise<boolean> {
  const result = await useDeviceCalendar.getState().connect();
  if (result === 'granted') return true;
  if (result === 'unavailable') {
    Alert.alert('Calendar', "Calendar sync works in the iPhone and Android app.");
    return false;
  }
  Alert.alert(
    'Calendar is off for Moves',
    "Allow it in your phone's Settings so Muse can spot your free time. Everything else works without it.",
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: openPhoneSettings },
    ],
  );
  return false;
}

/**
 * Calendar opt-in (Privacy). On reads the phone's calendar (iOS Calendar,
 * including Google or Outlook accounts added to it) and syncs busy blocks
 * only; off stops syncing and the server forgets the phone's blocks.
 */
export function CalendarToggle({ value, divider }: { value: boolean; divider?: boolean }) {
  const patch = useSettings((s) => s.patch);
  const connected = useDeviceCalendar((s) => s.connected);
  const permission = useDeviceCalendar((s) => s.permission);
  const [asking, setAsking] = useState(false);

  const turnOn = async () => {
    setAsking(true);
    await connectCalendar();
    setAsking(false);
  };

  const turnOff = async () => {
    setAsking(true);
    if (useDeviceCalendar.getState().connected) await useDeviceCalendar.getState().disconnect();
    else await patch({ calendar_opt_in: false });
    setAsking(false);
  };

  const notConnectedHere = value && !connected && permission !== 'unavailable';
  const blockedByOs = value && connected && permission === 'denied';
  return (
    <ToggleRow
      divider={divider}
      icon="calendar"
      title="Calendar"
      subtitle="Busy times from your phone's calendar, so Muse can spot your free time. No titles or details."
      value={value}
      busy={asking}
      onValueChange={(next) => void (next ? turnOn() : turnOff())}
    >
      {notConnectedHere || blockedByOs ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {blockedByOs
              ? "Calendar access is off in your phone's Settings, so Muse can't see when you're busy."
              : "Connect this phone's calendar so Muse plans around your real schedule."}
          </Text>
          <Button
            title={blockedByOs ? 'Open Settings' : 'Connect calendar'}
            size="sm"
            variant="tinted"
            onPress={blockedByOs ? openPhoneSettings : () => void turnOn()}
          />
        </View>
      ) : null}
    </ToggleRow>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing.sm, alignItems: 'flex-start', paddingLeft: 36 + spacing.md },
  noticeText: { ...typeScale.meta },
});
