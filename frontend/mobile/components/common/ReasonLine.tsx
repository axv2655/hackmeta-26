import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { museSourceLabel, type MuseSource } from '@/lib/muse';
import { colors, spacing, type as typeScale } from '@/lib/theme';

export type ReasonLineProps = {
  /** Why Muse picked or ranked this, e.g. "You and Priya both like ramen". */
  text: string;
  source?: MuseSource;
  style?: StyleProp<ViewStyle>;
};

/** One line: sparkle + Muse's reason. Blue when the model wrote it, gray for the heuristic. */
export function ReasonLine({ text, source, style }: ReasonLineProps) {
  const fg = source === 'muse' ? colors.chipSelectedText : colors.textSecondary;
  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={`${museSourceLabel(source)}: ${text}`}>
      <Icon name="sparkles" size={13} color={fg} strokeWidth={2.2} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  text: { ...typeScale.meta, flexShrink: 1 },
});

export default ReasonLine;
