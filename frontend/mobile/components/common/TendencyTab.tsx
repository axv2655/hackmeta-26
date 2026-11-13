import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

export type TendencyTabProps = {
  /** "Started 7:00, Tony's Kumo Moves usually last ~2h" (from `tendencyText`). */
  text: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A small tab under a live Move that says when it started and how long the
 * creator's Moves usually last, so friends still pull up after it started.
 */
export function TendencyTab({ text, style }: TendencyTabProps) {
  return (
    <View style={[styles.tab, style]} accessible accessibilityLabel={text}>
      <Icon name="clock" size={13} color={colors.textSecondary} strokeWidth={2.2} />
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  text: { ...typeScale.meta, color: colors.textSecondary, flexShrink: 1 },
});

export default TendencyTab;
