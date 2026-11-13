import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, type as typeScale } from '@/lib/theme';

export type ErrorStateProps = {
  /** Human text, usually `errorMessage(e)` from lib/backend. */
  message: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Shown when a load failed and there is nothing cached to show. */
export function ErrorState({ message, onRetry, style }: ErrorStateProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="alert">
      <View style={styles.iconCircle}>
        <Icon name="info" size={28} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>{message}</Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} variant="secondary" style={styles.button} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typeScale.sectionTitle, textAlign: 'center' },
  body: { ...typeScale.rowSub, textAlign: 'center' },
  button: { marginTop: spacing.md, alignSelf: 'center' },
});

export default ErrorState;
