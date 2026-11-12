import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { colors, fontWeights, layout, spacing } from '@/lib/theme';

import { textShadow } from './constants';

export type ReelsTopBarProps = {
  onPressSearch?: () => void;
  onPressProfile?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Transparent bar floating over the reel: "Reels" at the left, search and
 * profile at the right. It stays put while reels page underneath, and only its
 * buttons take touches.
 */
export function ReelsTopBar({ onPressSearch, onPressProfile, style }: ReelsTopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top, height: layout.headerHeight + insets.top }, style]}>
      <Text style={styles.title} accessibilityRole="header" allowFontScaling={false}>
        Reels
      </Text>
      <View style={styles.actions}>
        <IconButton
          name="search"
          accessibilityLabel="Search reels"
          size={26}
          color={colors.darkText}
          onPress={onPressSearch}
        />
        <IconButton
          name="profile"
          accessibilityLabel="Your reels profile"
          size={26}
          color={colors.darkText}
          onPress={onPressProfile}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.gutter,
    paddingRight: spacing.xs,
    pointerEvents: 'box-none',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: fontWeights.bold,
    color: colors.darkText,
    ...textShadow,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
});

export default ReelsTopBar;
