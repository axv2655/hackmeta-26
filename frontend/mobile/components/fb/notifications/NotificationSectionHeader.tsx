import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { colors, fontWeights, layout, spacing } from '@/lib/theme';

export type NotificationSectionHeaderProps = {
  title: string;
  /** Shows an X at the right edge ("Pending friend requests"). Hidden when omitted. */
  onDismiss?: () => void;
  dismissLabel?: string;
};

/** "New" / "Earlier" / "Pending friend requests" heading. */
export function NotificationSectionHeader({ title, onDismiss, dismissLabel }: NotificationSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {onDismiss ? (
        <IconButton
          name="close"
          size={24}
          color={colors.text}
          accessibilityLabel={dismissLabel ?? `Hide ${title.toLowerCase()}`}
          onPress={onDismiss}
          style={styles.dismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.gutter + spacing.xxs,
    paddingRight: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxs,
    backgroundColor: colors.white,
  },
  title: { flex: 1, fontSize: 20, lineHeight: 25, fontWeight: fontWeights.bold, letterSpacing: -0.3, color: colors.text },
  dismiss: { marginLeft: spacing.sm },
});

export default NotificationSectionHeader;
