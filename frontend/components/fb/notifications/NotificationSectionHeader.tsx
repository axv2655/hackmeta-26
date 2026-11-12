import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

export type NotificationSectionHeaderProps = {
  title: string;
  /** Blue text link at the right edge ("See all"). Hidden when omitted. */
  actionLabel?: string;
  onPressAction?: () => void;
};

/** "New" / "Earlier" heading above a group of notification rows. */
export function NotificationSectionHeader({ title, actionLabel, onPressAction }: NotificationSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {actionLabel ? (
        <PressableScale
          onPress={onPressAction}
          pressedOpacity={0.5}
          accessibilityRole="link"
          accessibilityLabel={`${actionLabel} ${title.toLowerCase()} notifications`}
          style={styles.action}
        >
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: layout.hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.gutter,
    backgroundColor: colors.white,
  },
  title: { ...typeScale.sectionTitle, fontWeight: fontWeights.bold },
  // Full-height target with its own side padding so the link is easy to hit.
  action: {
    height: layout.hitTarget,
    minWidth: layout.hitTarget,
    paddingHorizontal: layout.gutter,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeights.regular, color: colors.blue, paddingLeft: spacing.sm },
});

export default NotificationSectionHeader;
