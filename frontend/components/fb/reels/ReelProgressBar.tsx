import { memo, useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/lib/theme';

import { PROGRESS_BAR_HEIGHT, PROGRESS_TRACK_COLOR, REEL_DURATION_MS } from './constants';

export type ReelProgressBarProps = {
  /** Track width in points. */
  width: number;
  /** The reel is the visible page. Leaving it rewinds the bar to zero. */
  active: boolean;
  /** The reel is active and not paused. */
  playing: boolean;
  /** Length of one loop. Default 8s. */
  duration?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Thin playback bar along the bottom of a reel. Fills left to right over
 * `duration`, then loops. Pausing holds the fill where it is; leaving the reel
 * rewinds it. It is a progress indicator rather than decoration, so it keeps
 * running under Reduce Motion.
 */
function ReelProgressBarBase({ width, active, playing, duration = REEL_DURATION_MS, style }: ReelProgressBarProps) {
  const progress = useSharedValue(0);

  // Declared before the play effect so that leaving a reel cancels, then rewinds.
  useEffect(() => {
    if (active) return;
    cancelAnimation(progress);
    progress.set(0);
  }, [active, progress]);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(progress);
      return;
    }
    const from = Math.min(Math.max(progress.get(), 0), 1);
    const linear = { easing: Easing.linear, reduceMotion: ReduceMotion.Never } as const;
    progress.set(
      withSequence(
        ReduceMotion.Never,
        // Finish the lap that was in flight when the reel was paused...
        withTiming(1, { ...linear, duration: Math.max(1, (1 - from) * duration) }),
        // ...then rewind and loop full laps.
        withTiming(0, { ...linear, duration: 0 }),
        withRepeat(withTiming(1, { ...linear, duration }), -1, false, undefined, ReduceMotion.Never),
      ),
    );
    return () => cancelAnimation(progress);
  }, [playing, duration, progress]);

  // translateX on a full-width fill: no layout pass per frame, unlike animating `width`.
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.get() - 1) * width }],
  }));

  return (
    <View
      style={[styles.track, { width }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Reel progress"
    >
      <Animated.View style={[styles.fill, fillStyle]} />
    </View>
  );
}

export const ReelProgressBar = memo(ReelProgressBarBase);

const styles = StyleSheet.create({
  track: {
    height: PROGRESS_BAR_HEIGHT,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    overflow: 'hidden',
    backgroundColor: PROGRESS_TRACK_COLOR,
    pointerEvents: 'none',
  },
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: PROGRESS_BAR_HEIGHT / 2,
    backgroundColor: colors.darkText,
  },
});

export default ReelProgressBar;
