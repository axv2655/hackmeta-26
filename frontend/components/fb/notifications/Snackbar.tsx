import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, layout, motion, radii, shadows, spacing } from '@/lib/theme';

const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);
const RISE = 12;

export type SnackbarProps = {
  message: string;
  /** Text button at the right edge ("Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  /** Called once the bar has timed out and faded. Must be stable (useCallback). */
  onDismiss: () => void;
  /** Milliseconds on screen. Default 4000. */
  duration?: number;
};

/**
 * Dark confirmation bar pinned above the tab bar. Mount it with a fresh `key` per message so the
 * timer restarts; it fades itself out and then calls `onDismiss`.
 */
export function Snackbar({ message, actionLabel, onAction, onDismiss, duration = 4000 }: SnackbarProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(1, { duration: motion.base, easing: EASE_OUT }));
    const fade = setTimeout(() => {
      progress.set(withTiming(0, { duration: motion.fast, easing: EASE_OUT }));
    }, duration);
    const done = setTimeout(onDismiss, duration + motion.fast);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [duration, onDismiss, progress]);

  const rise = reduceMotion ? 0 : RISE;
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * rise }],
  }));

  return (
    <Animated.View style={[styles.bar, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {actionLabel ? (
        <PressableScale onPress={onAction} accessibilityLabel={actionLabel} style={styles.action}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: layout.gutter,
    right: layout.gutter,
    bottom: layout.gutter,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.text,
    ...shadows.raised,
  },
  message: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
  action: {
    alignSelf: 'stretch',
    minWidth: layout.hitTarget,
    minHeight: layout.hitTarget,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeights.bold, color: colors.white },
});

export default Snackbar;
