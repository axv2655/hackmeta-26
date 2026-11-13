import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';

import { MovesIllustration } from './MovesIllustration';

export type MovesEmptyStateProps = {
  /** Opens the composer. */
  onPressMake: () => void;
  title?: string;
  description?: string;
  /** Illustration width; smaller inside the sheet. */
  art?: number;
  style?: StyleProp<ViewStyle>;
};

/** Shown when no friend has a Move out: a short pitch and a Make a Move button. */
export function MovesEmptyState({
  onPressMake,
  title = 'No Moves out right now',
  description = "Share what you're doing right now and friends pull up. No events, no RSVPs.",
  art = 232,
  style,
}: MovesEmptyStateProps) {
  return (
    <View style={[styles.root, style]}>
      <MovesIllustration width={art} />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>
      <Button title="Make a Move" size="lg" fullWidth onPress={onPressMake} style={styles.button} />
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
