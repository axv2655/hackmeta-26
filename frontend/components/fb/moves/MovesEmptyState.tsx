import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, spacing, type as typeScale } from '@/lib/theme';

import { MovesIllustration } from './MovesIllustration';

export type MovesEmptyStateProps = {
  onPressShare?: () => void;
};

/** Centered pitch for Moves, shown until the real map lands. */
export function MovesEmptyState({ onPressShare }: MovesEmptyStateProps) {
  return (
    <View style={styles.root}>
      <MovesIllustration />
      <Text style={styles.title} accessibilityRole="header">
        See what your friends are up to
      </Text>
      <Text style={styles.description}>
        Share what you&apos;re doing right now and friends pull up. No events, no RSVPs.
      </Text>
      {/* Button fires a light haptic on its own; sharing is not wired up yet. */}
      <Button title="Share a Move" size="lg" onPress={onPressShare} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    // Optical centering: the block reads as centered when it sits a little high.
    paddingBottom: spacing.xxxl,
  },
  title: { ...typeScale.eventTitle, textAlign: 'center', marginTop: spacing.xxl },
  description: {
    ...typeScale.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.sm,
  },
  button: { marginTop: spacing.xl, paddingHorizontal: spacing.xxl },
});

export default MovesEmptyState;
