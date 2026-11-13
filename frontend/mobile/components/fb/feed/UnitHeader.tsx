import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

export type UnitHeaderProps = {
  title: string;
  /** Small glyph before the title ("Reels and short videos"). */
  icon?: IconName;
  /** Row height. The 44pt buttons may overflow a shorter row; that is intended. Default 48. */
  height?: number;
  /** Renders the "..." button when set. */
  onPressMore?: () => void;
  /** Renders the X button when set. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Title row shared by the feed's suggestion units: title at the gutter, "..." and X flush right. */
export function UnitHeader({ title, icon, height = 48, onPressMore, onDismiss, style }: UnitHeaderProps) {
  return (
    <View style={[styles.row, { height }, style]}>
      {icon ? <Icon name={icon} size={20} color={colors.text} filled style={styles.icon} /> : null}
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {onPressMore ? (
        <IconButton
          name="more"
          size={22}
          color={colors.textSecondary}
          hitSize={40}
          accessibilityLabel={`More options for ${title}`}
          onPress={onPressMore}
        />
      ) : null}
      {onDismiss ? (
        <IconButton
          name="close"
          size={24}
          color={colors.textSecondary}
          hitSize={40}
          accessibilityLabel={`Hide ${title}`}
          onPress={onDismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingRight: spacing.xs,
  },
  icon: { marginRight: spacing.sm },
  title: {
    ...typeScale.sectionTitle,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.3,
    flex: 1,
  },
});

export default UnitHeader;
