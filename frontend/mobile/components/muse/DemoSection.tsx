import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type as typeScale } from '@/lib/theme';

export type DemoSectionProps = { title: string; note?: string; children: ReactNode };

/** A titled group of Demo Control buttons. */
export function DemoSection({ title, note, children }: DemoSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.xs },
  title: { ...typeScale.sectionTitle },
  note: { ...typeScale.meta, color: colors.textSecondary },
  body: { gap: spacing.sm, marginTop: spacing.sm },
});

export default DemoSection;
