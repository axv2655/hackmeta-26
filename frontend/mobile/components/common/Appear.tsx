import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

const STEP_MS = 35;
const MAX_STAGGER = 8;

/**
 * Rises and fades in once, when it first mounts. `index` staggers list rows (capped so long lists
 * don't wait). Reanimated skips it under the system Reduce Motion setting.
 */
export function Appear({ index = 0, style, children }: { index?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(240).delay(Math.min(index, MAX_STAGGER) * STEP_MS)} style={style}>
      {children}
    </Animated.View>
  );
}
