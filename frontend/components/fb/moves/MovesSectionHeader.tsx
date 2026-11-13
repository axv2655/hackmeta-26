import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, spacing } from '@/lib/theme';

/** Solid teardrop pin with a white dot, like Marketplace's location pin. */
function LocationPin({ size = 20, color = colors.blue }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 2.25c-4.28 0-7.75 3.36-7.75 7.6 0 5.2 6.1 10.95 6.86 11.65a1.3 1.3 0 0 0 1.78 0c.76-.7 6.86-6.45 6.86-11.65 0-4.24-3.47-7.6-7.75-7.6Z"
        fill={color}
      />
      <Circle cx={12} cy={9.9} r={2.9} fill={colors.white} />
    </Svg>
  );
}

export type MovesSectionHeaderProps = {
  title: string;
  /** City shown at the right with a blue pin. */
  location?: string;
  onPressLocation?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** "Happening now ............ (pin) Menlo Park, CA" row above the Moves content. */
export function MovesSectionHeader({ title, location, onPressLocation, style }: MovesSectionHeaderProps) {
  return (
    <View style={[styles.root, style]}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {location ? (
        <PressableScale
          onPress={onPressLocation}
          haptic
          scaleTo={0.96}
          accessibilityRole="button"
          accessibilityLabel={`Location: ${location}`}
          hitSlop={8}
          style={styles.location}
        >
          <LocationPin />
          <Text style={styles.locationText} numberOfLines={1}>
            {location}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.3,
    color: colors.text,
  },
  location: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  locationText: { fontSize: 17, lineHeight: 22, fontWeight: fontWeights.regular, color: colors.blue },
});

export default MovesSectionHeader;
