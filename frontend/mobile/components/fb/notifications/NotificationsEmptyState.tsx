import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, fontWeights, spacing, type as typeScale } from '@/lib/theme';

export type NotificationsEmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onPressAction?: () => void;
};

/** Centered message shown when a filter has nothing to list. */
export function NotificationsEmptyState({ icon, title, message, actionLabel, onPressAction }: NotificationsEmptyStateProps) {
  return (
    <View style={styles.root}>
      <View style={styles.circle}>
        <Icon name={icon} size={36} color={colors.textSecondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel ? (
        <Button title={actionLabel} variant="tinted" onPress={onPressAction} style={styles.button} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: 72,
    paddingBottom: spacing.xxxl,
  },
  circle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  title: { fontSize: 20, lineHeight: 25, fontWeight: fontWeights.bold, color: colors.text, textAlign: 'center' },
  message: { ...typeScale.rowSub, textAlign: 'center', marginTop: spacing.xs },
  button: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
});

export default NotificationsEmptyState;
