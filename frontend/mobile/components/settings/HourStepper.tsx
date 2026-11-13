import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { hourLabel } from '@/lib/settings';
import { colors, hairline, spacing, type as typeScale } from '@/lib/theme';

export type HourStepperProps = {
  label: string;
  hour: number;
  onChange: (hour: number) => void;
  disabled?: boolean;
};

/** "Starts  [-] 10 PM [+]": steps one hour, wrapping around midnight. */
export function HourStepper({ label, hour, onChange, disabled }: HourStepperProps) {
  const step = (delta: number) => onChange((hour + delta + 24) % 24);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controls}>
        <StepButton icon="chevron-left" label={`${label} one hour earlier`} onPress={() => step(-1)} disabled={disabled} />
        <Text style={styles.value} accessibilityLiveRegion="polite">
          {hourLabel(hour)}
        </Text>
        <StepButton icon="chevron-right" label={`${label} one hour later`} onPress={() => step(1)} disabled={disabled} />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={18} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...hairline('Top'),
  },
  label: { ...typeScale.row },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { ...typeScale.name, minWidth: 64, textAlign: 'center' },
  step: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.grayButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: colors.grayButtonPressed },
  disabled: { opacity: 0.4 },
});
