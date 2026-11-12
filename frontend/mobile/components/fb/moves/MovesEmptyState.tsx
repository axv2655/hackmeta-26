import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';

import { MovesIllustration } from './MovesIllustration';

export type MovesEmptyStateProps = {
  onPressShare?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Centered pitch for Moves, shown until the real map lands. */
export function MovesEmptyState({ onPressShare, style }: MovesEmptyStateProps) {
  return (
    <View style={[styles.root, style]}>
      <MovesIllustration width={232} />
      <Text style={styles.title} accessibilityRole="header">
        See what your friends are up to
      </Text>
      <Text style={styles.description}>
        Share what you&apos;re doing right now and friends pull up. No events, no RSVPs.
      </Text>
      {/* Button fires a light haptic on its own; sharing is not wired up yet. */}
      <Button title="Share a Move" size="lg" fullWidth onPress={onPressShare} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
  },
  title: {
    ...typeScale.eventTitle,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: fontWeights.heavy,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  description: {
    ...typeScale.row,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.sm,
  },
  // Large iOS 26 call to action: 56pt tall, 12pt corners, capped so it does not span an iPad.
  button: {
    height: layout.buttonHeight,
    borderRadius: radius.md,
    marginTop: spacing.xxl,
    maxWidth: 360,
    width: '100%',
    alignSelf: 'center',
  },
});

export default MovesEmptyState;
