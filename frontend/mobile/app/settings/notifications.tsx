import { useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { HourStepper } from '@/components/settings/HourStepper';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LinkRow, SettingsGroup, ToggleRow } from '@/components/settings/SettingsRow';
import { DEFAULT_QUIET_HOURS, hourLabel, useSettings } from '@/lib/settings';
import { spacing } from '@/lib/theme';
import type { Me } from '@/lib/types';

function QuietHours({ value }: { value: Me['settings']['quiet_hours'] }) {
  const patch = useSettings((s) => s.patch);
  const on = value !== null;
  return (
    <SettingsGroup
      title="Quiet hours"
      footer={
        on
          ? `No Move alerts or Muse suggestions from ${hourLabel(value.start)} to ${hourLabel(value.end)}.`
          : 'Pause Move alerts and Muse suggestions overnight.'
      }
    >
      <ToggleRow
        icon="moon"
        title="Quiet hours"
        value={on}
        onValueChange={(next) => void patch({ quiet_hours: next ? { ...DEFAULT_QUIET_HOURS } : null })}
      />
      {on ? (
        <>
          <HourStepper
            label="Starts"
            hour={value.start}
            onChange={(start) => void patch({ quiet_hours: { start, end: value.end } })}
          />
          <HourStepper
            label="Ends"
            hour={value.end}
            onChange={(end) => void patch({ quiet_hours: { start: value.start, end } })}
          />
        </>
      ) : null}
    </SettingsGroup>
  );
}

function NotificationsBody({ me }: { me: Me }) {
  const router = useRouter();
  const patch = useSettings((s) => s.patch);
  return (
    <>
      <SettingsGroup title="Muse" footer="Muse proposes, you decide. Nothing posts or goes out without your tap.">
        <ToggleRow
          icon="sparkles"
          title="Muse suggestions"
          subtitle="Flares for gaps in your calendar and nudges when a crew hasn't met in a while."
          value={me.settings.muse_proactive}
          onValueChange={(v) => void patch({ muse_proactive: v })}
        >
          <View style={styles.badge}>
            <MuseBadge />
          </View>
        </ToggleRow>
      </SettingsGroup>
      <QuietHours value={me.settings.quiet_hours} />
      <SettingsGroup footer="Friends' Moves only reach you for the kinds you pick.">
        <LinkRow icon="filter" title="Kinds of Moves you want" onPress={() => router.push('/settings/privacy' as Href)} />
      </SettingsGroup>
    </>
  );
}

export default function NotificationSettingsScreen() {
  return <SettingsPage title="Notifications">{(me) => <NotificationsBody me={me} />}</SettingsPage>;
}

const styles = StyleSheet.create({
  badge: { paddingLeft: 36 + spacing.md },
});
