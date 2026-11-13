import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CategoryChips } from '@/components/settings/CategoryChips';
import { ExplainerSheet } from '@/components/settings/ExplainerSheet';
import { LocationToggle } from '@/components/settings/LocationToggle';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LinkRow, SettingsGroup, ToggleRow } from '@/components/settings/SettingsRow';
import { Icon } from '@/components/ui/Icon';
import { useSettings } from '@/lib/settings';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Me } from '@/lib/types';

function MarkExplainer() {
  return (
    <View style={styles.explainer}>
      <Icon name="map-pin" size={22} color={colors.tintText} />
      <Text style={styles.explainerText}>
        A Mark shows a place, never you. Your exact location never leaves your phone.
      </Text>
    </View>
  );
}

function BleToggle({ value }: { value: boolean }) {
  const patch = useSettings((s) => s.patch);
  const [explaining, setExplaining] = useState(false);
  return (
    <>
      <ToggleRow
        divider
        icon="users"
        title="Bluetooth proximity"
        subtitle="Notice when friends are with you, to offer them your Move."
        value={value}
        onValueChange={(next) => (next ? setExplaining(true) : void patch({ ble_opt_in: false }))}
      />
      <ExplainerSheet
        visible={explaining}
        icon="users"
        title="Bluetooth proximity"
        body="Simulated in this build. When on, friends you're with can be offered your Move. You always get a one-tap prompt unless they're on your Auto-join list."
        confirmLabel="Turn on"
        onConfirm={() => {
          setExplaining(false);
          void patch({ ble_opt_in: true });
        }}
        onCancel={() => setExplaining(false)}
      />
    </>
  );
}

function PrivacyBody({ me }: { me: Me }) {
  const router = useRouter();
  const patch = useSettings((s) => s.patch);
  const s = me.settings;
  const go = (href: string) => router.push(href as Href);
  return (
    <>
      <MarkExplainer />
      <SettingsGroup title="What Moves can use" footer="Every feature still works with these off.">
        <LocationToggle value={s.location_opt_in} />
        <BleToggle value={s.ble_opt_in} />
        <ToggleRow
          divider
          icon="calendar"
          title="Calendar"
          subtitle="Busy blocks only, so Muse can spot your free time. No titles or details."
          value={s.calendar_opt_in}
          onValueChange={(v) => void patch({ calendar_opt_in: v })}
        />
      </SettingsGroup>
      <SettingsGroup title="Who can find your Moves">
        <ToggleRow
          icon="compass"
          title="Open Moves nearby"
          subtitle="See Open Moves from people right around you. Off means friends' Moves only."
          value={s.open_moves_opt_in}
          onValueChange={(v) => void patch({ open_moves_opt_in: v })}
        />
        <ToggleRow
          divider
          icon="history"
          title="Leave a ghost after Moves"
          subtitle="Your gray avatar stays at the Mark for a while after a Move, for friends who missed it."
          value={s.ghost_visible}
          onValueChange={(v) => void patch({ ghost_visible: v })}
        />
        <LinkRow divider icon="eye-off" title="Hidden from" onPress={() => go('/settings/hidden')} />
        <LinkRow divider icon="user-check" title="Auto-join" onPress={() => go('/settings/autojoin')} />
        <LinkRow divider icon="users" title="Circles" onPress={() => go('/circles')} />
      </SettingsGroup>
      <SettingsGroup title="Muse">
        <ToggleRow
          icon="sparkles"
          title="Muse suggestions"
          subtitle="Muse proposes Flares for free time and nudges fading crews. Nothing posts without your tap."
          value={s.muse_proactive}
          onValueChange={(v) => void patch({ muse_proactive: v })}
        />
      </SettingsGroup>
      <SettingsGroup
        title="Kinds of Moves you want"
        footer="You only hear about friends' Moves of these kinds. All on means everything."
      >
        <CategoryChips value={s.move_categories} onChange={(next) => void patch({ move_categories: next })} />
      </SettingsGroup>
    </>
  );
}

export default function PrivacyScreen() {
  return <SettingsPage title="Privacy">{(me) => <PrivacyBody me={me} />}</SettingsPage>;
}

const styles = StyleSheet.create({
  explainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.tintBg,
  },
  explainerText: { ...typeScale.body, color: colors.tintText, flex: 1 },
});
