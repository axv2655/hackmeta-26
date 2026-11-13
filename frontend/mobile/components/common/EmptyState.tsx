import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, spacing, type as typeScale } from '@/lib/theme';

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  body?: string;
  /** One button, e.g. "Make a Move". */
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
};

/** Shown when a list loaded fine but has nothing in it. */
export function EmptyState({ icon, title, body, action, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      {icon ? (
        <View style={styles.iconCircle}>
          <Icon name={icon} size={28} color={colors.textSecondary} />
        </View>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <Button title={action.label} onPress={action.onPress} variant="tinted" style={styles.button} />
      ) : null}
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

export default EmptyState;
