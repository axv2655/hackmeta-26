import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, spacing, type as typeScale } from '@/lib/theme';

export type SuggestionBusy = 'accept' | 'dismiss' | 'never' | null;

export type SuggestionActionsProps = {
  primary: string;
  busy: SuggestionBusy;
  /** Why the primary button is disabled, shown above it. */
  blockedReason: string | null;
  /** Revive only: mute this crew for good. */
  showNeverAgain: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onNeverAgain: () => void;
};

/** Accept / Not now (and "Don't suggest this crew again" for revive). Nothing posts without this tap. */
export function SuggestionActions(p: SuggestionActionsProps) {
  const working = p.busy !== null;
  return (
    <View style={styles.wrap}>
      {p.blockedReason ? <Text style={styles.blocked}>{p.blockedReason}</Text> : null}
      <Button
        title={p.busy === 'accept' ? 'Working…' : p.primary}
        size="lg"
        fullWidth
        disabled={working || Boolean(p.blockedReason)}
        left={p.busy === 'accept' ? <ActivityIndicator color={colors.white} /> : undefined}
        onPress={p.onAccept}
      />
      <Button
        title="Not now"
        variant="secondary"
        size="lg"
        fullWidth
        disabled={working}
        left={p.busy === 'dismiss' ? <ActivityIndicator color={colors.text} /> : undefined}
        onPress={p.onDismiss}
      />
      {p.showNeverAgain ? (
        <Pressable
          onPress={p.onNeverAgain}
          disabled={working}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.never}
        >
          {p.busy === 'never' ? <ActivityIndicator color={colors.textSecondary} /> : null}
          <Text style={styles.neverText}>Don't suggest this crew again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  blocked: { ...typeScale.meta, textAlign: 'center' },
  never: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  neverText: { ...typeScale.button, color: colors.textSecondary },
});

export default SuggestionActions;
