import { StyleSheet, Switch, Text, View } from 'react-native';

import type { FillMinutes } from '@/lib/composer';
import { colors, spacing, type as typeScale } from '@/lib/theme';

import { Chip, section } from './Chip';

type Props = {
  open: boolean;
  onOpen: (v: boolean) => void;
  fill: FillMinutes;
  onFill: (v: FillMinutes) => void;
};

const FILLS: { value: FillMinutes; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
];

/** Open (nearby people over Bluetooth, never public) and the Flare fill window. */
export function OpenFillControls({ open, onOpen, fill, onFill }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.title}>Open Move</Text>
          <Text style={section.meta}>
            People near you can see it when you're together. Never public, and only while it's on.
          </Text>
        </View>
        <Switch
          value={open}
          onValueChange={onOpen}
          trackColor={{ true: colors.blue, false: colors.grayButton }}
          accessibilityLabel="Open Move"
        />
      </View>
      <View>
        <Text style={styles.title}>Fill</Text>
        <Text style={section.meta}>
          {fill ? `A Flare: friends get ${fill} minutes to pull up.` : 'Turn on to make this a Flare that fills fast.'}
        </Text>
      </View>
      <View style={section.wrapRow}>
        {FILLS.map((f) => (
          <Chip key={f.value} label={f.label} small on={fill === f.value} onPress={() => onFill(f.value)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...typeScale.name },
});
