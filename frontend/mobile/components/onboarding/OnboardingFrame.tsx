import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, spacing, type as typeScale } from '@/lib/theme';

type Props = {
  step: number;
  total: number;
  icon: IconName;
  title: string;
  body: string;
  children?: ReactNode;
  primary: { label: string; onPress: () => void; disabled?: boolean };
  /** "Not now": moves on without doing the step. */
  onNotNow: () => void;
  /** "Skip": leaves onboarding entirely. */
  onSkipAll: () => void;
};

/** One onboarding card: progress dots, a header, the step's content, and its two buttons. */
export function OnboardingFrame({ step, total, icon, title, body, children, primary, onNotNow, onSkipAll }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.top}>
        <View style={styles.dots} accessible accessibilityLabel={`Step ${step + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <PressableScale onPress={onSkipAll} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </PressableScale>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconCircle}>
          <Icon name={icon} size={30} color={colors.blue} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
        {children}
      </ScrollView>
      <View style={styles.buttons}>
        <Button title={primary.label} size="lg" onPress={primary.onPress} disabled={primary.disabled} fullWidth />
        <Button title="Not now" variant="secondary" onPress={onNotNow} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, height: 44 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hairline },
  dotOn: { width: 22, backgroundColor: colors.blue },
  skip: { ...typeScale.button, color: colors.textSecondary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xl, gap: spacing.md },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typeScale.eventTitle, textAlign: 'left' },
  body: { ...typeScale.body, color: colors.textSecondary },
  buttons: { paddingHorizontal: spacing.lg, gap: spacing.sm },
});
