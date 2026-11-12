import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/lib/theme';

export type VerifiedBadgeProps = {
  /** Diameter. Default 14 (sits next to a 16pt name). */
  size?: number;
  /** Disc color. Default `colors.blue`. */
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/** Blue disc with a white check, shown after verified page names. */
export function VerifiedBadge({ size = 14, color = colors.blue, style }: VerifiedBadgeProps) {
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Verified"
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle cx={12} cy={12} r={11} fill={color} />
        <Path
          d="M7.2 12.4l3.2 3.2 6.4-6.8"
          stroke={colors.white}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

export default VerifiedBadge;
