import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useConnectivity } from '@/lib/connectivity';
import { colors, spacing, type as typeScale } from '@/lib/theme';

export type OfflineBarProps = { style?: StyleProp<ViewStyle> };

/** Thin bar shown only while the last request could not reach the backend. */
export function OfflineBar({ style }: OfflineBarProps) {
  const reachable = useConnectivity((s) => s.reachable);
  if (reachable !== false) return null;
  return (
    <View style={[styles.bar, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text} numberOfLines={1}>
        Can't reach Moves · showing what we last had
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.textSecondary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  text: { ...typeScale.meta, color: colors.white },
});

export default OfflineBar;
