import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing, type as typeScale } from '@/lib/theme';

export type LoadingStateProps = {
  /** Short line under the spinner, e.g. "Loading Moves". */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** First-load placeholder: a centered spinner with an optional label. */
export function LoadingState({ label, style }: LoadingStateProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <ActivityIndicator color={colors.textSecondary} />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  label: { ...typeScale.meta, textAlign: 'center' },
});

export default LoadingState;
