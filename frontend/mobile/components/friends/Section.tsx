import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, layout, spacing, type as typeScale } from '@/lib/theme';

/** Section title with an optional red count and a right-side link. */
export function SectionHeader({ title, count, right }: { title: string; count?: number; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
        {count ? <Text style={styles.count}>{`  ${count}`}</Text> : null}
      </Text>
      {right}
    </View>
  );
}

/** One quiet line for an empty section inside a longer page. */
export function SectionEmpty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

/** Small inline spinner for a section that is still loading. */
export function SectionLoading({ label }: { label: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  title: { ...typeScale.sectionTitle, fontSize: 20, lineHeight: 25, fontWeight: '700', flexShrink: 1 },
  count: { color: colors.badgeRed, fontSize: 17 },
  empty: { ...typeScale.rowSub, paddingHorizontal: layout.gutter + spacing.xs, paddingVertical: spacing.sm },
  loading: { paddingVertical: spacing.lg },
});
