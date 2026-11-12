import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/lib/theme';

import { EASE_OUT } from './constants';

const SIZE = 104;
const HOLD_MS = 420;
const EXIT_MS = 320;
/** Total time one burst stays mounted. */
export const HEART_BURST_LIFETIME_MS = HOLD_MS + EXIT_MS + 80;

export type HeartBurstProps = {
  /** Tap position inside the reel, in points. The heart is centered on it. */
  x: number;
  y: number;
  /** Tilt in degrees, so repeated bursts do not stack identically. */
  rotation?: number;
  /** Called once the burst has faded out, so the parent can unmount it. */
  onDone: () => void;
};

/**
 * The heart that pops where the viewer double-tapped: springs up from 60%,
 * holds, then drifts up and fades. Purely decorative, so it never takes touches.
 */
export function HeartBurst({ x, y, rotation = 0, onDone }: HeartBurstProps) {
  const pop = useSharedValue(0);
  const exit = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    pop.set(withSpring(1, { duration: 320, dampingRatio: 0.55 }));
    exit.set(withDelay(HOLD_MS, withTiming(1, { duration: EXIT_MS, easing: EASE_OUT })));
    const timer = setTimeout(onDone, HEART_BURST_LIFETIME_MS);
    return () => clearTimeout(timer);
    // Runs once per burst: a burst is mounted, plays, and is removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = pop.get();
    const e = exit.get();
    return {
      opacity: Math.min(1, p * 3) * (1 - e),
      transform: reduceMotion
        ? [{ rotate: `${rotation}deg` }]
        : [{ translateY: -36 * e }, { scale: 0.6 + 0.4 * p + 0.15 * e }, { rotate: `${rotation}deg` }],
    };
  });

  return (
    <Animated.View style={[styles.heart, { left: x - SIZE / 2, top: y - SIZE / 2 }, animatedStyle]}>
      <Icon name="heart" filled size={SIZE} color={colors.love} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    pointerEvents: 'none',
  },
});

export default HeartBurst;
