import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { colors, spacing } from '@/lib/theme';

import { SkeletonCards, SkeletonDetail, SkeletonGrid, SkeletonRows } from './Skeleton';

export type LoadingVariant = 'rows' | 'grid' | 'detail' | 'cards' | 'spinner';

export type LoadingStateProps = {
  /** What is loading, read by screen readers, e.g. "Loading Moves". */
  label?: string;
  /** The shape of the page being loaded. `spinner` is for dark or full-bleed screens. */
  variant?: LoadingVariant;
  /** Rows to draw for `rows` (small embedded lists want fewer). */
  rows?: number;
  style?: StyleProp<ViewStyle>;
};

/** First-load placeholder: a skeleton shaped like the page, faded in and out. */
export function LoadingState({ label, variant = 'rows', rows, style }: LoadingStateProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={[variant === 'spinner' ? styles.center : styles.fill, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
    >
      {variant === 'spinner' ? <ActivityIndicator color={colors.textSecondary} /> : null}
      {variant === 'rows' ? <SkeletonRows count={rows} /> : null}
      {variant === 'grid' ? <SkeletonGrid /> : null}
      {variant === 'detail' ? <SkeletonDetail /> : null}
      {variant === 'cards' ? <SkeletonCards /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl },
});

export default LoadingState;
