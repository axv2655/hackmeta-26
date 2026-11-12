import { useCallback, type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { tap } from '@/lib/haptics';
import { motion } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  /** Plain style only (no function style): the press state is animated for you. */
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. Default 0.97. Use 1 for full-width rows that should only dim. */
  scaleTo?: number;
  /** Opacity while pressed. Default 0.7. Use 1 to only scale. */
  pressedOpacity?: number;
  /** Fire a light haptic on press (no-op on web). Default false. */
  haptic?: boolean;
};

/**
 * Drop-in Pressable with press feedback: a quick scale + dim on press-in that
 * eases back on release. Runs on the UI thread. When `disabled`, it does not
 * respond and renders at 50% opacity.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  pressedOpacity = 0.7,
  haptic = false,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const scale = reduceMotion ? 1 : scaleTo;

  const restOpacity = disabled ? 0.5 : 1;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: restOpacity * (1 - pressed.get() * (1 - pressedOpacity)),
    transform: [{ scale: 1 - pressed.get() * (1 - scale) }],
  }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      pressed.set(withTiming(1, { duration: motion.press, easing: EASE_OUT }));
      onPressIn?.(e);
    },
    [onPressIn, pressed],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      pressed.set(withTiming(0, { duration: motion.base, easing: EASE_OUT }));
      onPressOut?.(e);
    },
    [onPressOut, pressed],
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (haptic) tap();
      onPress?.(e);
    },
    [haptic, onPress],
  );

  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

export default PressableScale;
