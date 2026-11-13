import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

export const FILL_MIN = 5;
export const FILL_MAX = 10;

/** A fill time inside the 5-10 minute range a Flare allows. */
export function clampFill(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n)) return FILL_MAX;
  return Math.min(FILL_MAX, Math.max(FILL_MIN, Math.round(n)));
}

export type FillStepperProps = { value: number; onChange: (n: number) => void };

/** How long the Flare stays open for friends to say they're in (5-10 min). */
export function FillStepper({ value, onChange }: FillStepperProps) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title}>Fills in</Text>
        <Text style={styles.sub}>Friends have this long to say they're in</Text>
      </View>
      <View style={styles.stepper}>
        <Step
          label="-"
          spoken="One minute less"
          disabled={value <= FILL_MIN}
          onPress={() => onChange(clampFill(value - 1))}
        />
        <Text style={styles.value} accessibilityLiveRegion="polite">
          {value} min
        </Text>
        <Step
          label="+"
          spoken="One minute more"
          disabled={value >= FILL_MAX}
          onPress={() => onChange(clampFill(value + 1))}
        />
      </View>
    </View>
  );
}

type StepProps = { label: string; spoken: string; disabled: boolean; onPress: () => void };

function Step({ label, spoken, disabled, onPress }: StepProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
    >
      <Text style={[styles.stepText, disabled && styles.stepDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, minWidth: 0 },
  title: { ...typeScale.name },
  sub: { ...typeScale.meta },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
  },
  value: { ...typeScale.name, minWidth: 56, textAlign: 'center' },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: colors.grayButton },
  stepText: { fontSize: 22, lineHeight: 26, fontWeight: '600', color: colors.text },
  stepDisabled: { color: colors.placeholder },
});

export default FillStepper;
