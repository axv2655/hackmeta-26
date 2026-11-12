import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Switch } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { selection } from '@/lib/haptics';
import { colors, motion, shadows } from '@/lib/theme';

export type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel: string;
};

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const THUMB = 27;
const TRAVEL = TRACK_WIDTH - THUMB - 4;
const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);

/**
 * The platform switch on iOS and Android. react-native-web draws a Material
 * style switch, so on web an iOS-shaped one (51x31, blue track) is drawn instead.
 */
export function ToggleSwitch({ value, onValueChange, accessibilityLabel }: ToggleSwitchProps) {
  const handleChange = (next: boolean) => {
    selection();
    onValueChange(next);
  };

  if (Platform.OS !== 'web') {
    return (
      <Switch
        value={value}
        onValueChange={handleChange}
        trackColor={{ false: colors.grayButton, true: colors.blue }}
        ios_backgroundColor={colors.grayButton}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return <WebSwitch value={value} onValueChange={handleChange} accessibilityLabel={accessibilityLabel} />;
}

function WebSwitch({ value, onValueChange, accessibilityLabel }: ToggleSwitchProps) {
  const reduceMotion = useReducedMotion();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.set(withTiming(value ? 1 : 0, { duration: reduceMotion ? 0 : motion.base, easing: EASE_OUT }));
  }, [on, reduceMotion, value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [colors.grayButton, colors.blue]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: on.get() * TRAVEL }],
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={7}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    ...shadows.raised,
  },
});

export default ToggleSwitch;
