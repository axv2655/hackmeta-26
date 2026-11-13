import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, layout, radius, spacing } from '@/lib/theme';

type BlockProps = { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> };

/** One gray placeholder block that breathes while content loads (static with Reduce Motion). */
export function Skeleton({ w = '100%', h = 14, r = radius.sm, style }: BlockProps) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [pulse, reduce]);
  const anim = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.block, { width: w, height: h, borderRadius: r }, anim, style]} />;
}

/** Avatar + two lines, like a person or notification row. */
function Row() {
  return (
    <View style={styles.row}>
      <Skeleton w={44} h={44} r={22} />
      <View style={styles.lines}>
        <Skeleton w="62%" />
        <Skeleton w="38%" h={11} />
      </View>
    </View>
  );
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => <Row key={i} />)}
    </View>
  );
}

/** Square tiles, like the Moments grid. */
export function SkeletonGrid({ count = 9, cols = 3 }: { count?: number; cols?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} r={0} style={{ width: `${100 / cols - 1}%`, aspectRatio: 1, height: undefined }} />
      ))}
    </View>
  );
}

/** A hero block, a title, a few lines and two rows, like a Move, place or profile page. */
export function SkeletonDetail() {
  return (
    <View style={styles.detail}>
      <Skeleton h={180} r={radius.lg} />
      <Skeleton w="70%" h={22} />
      <Skeleton w="45%" />
      <View style={styles.buttons}>
        <Skeleton w="48%" h={40} r={radius.md} />
        <Skeleton w="48%" h={40} r={radius.md} />
      </View>
      <Row />
      <Row />
    </View>
  );
}

/** Feed cards: header row, text and a photo, like Memories. */
export function SkeletonCards({ count = 2 }: { count?: number }) {
  return (
    <View style={styles.cards}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.card}>
          <Row />
          <Skeleton w="80%" />
          <Skeleton h={200} r={radius.md} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.grayButton },
  list: { paddingHorizontal: layout.gutter, paddingVertical: spacing.md, gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lines: { flex: 1, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between' },
  detail: { padding: spacing.lg, gap: spacing.md },
  buttons: { flexDirection: 'row', justifyContent: 'space-between' },
  cards: { padding: layout.gutter, gap: spacing.md },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
});
