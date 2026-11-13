import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, spacing, type as typeScale } from '@/lib/theme';

/** Icon + one or two lines, for onboarding explainers. */
export function Bullet({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.xs },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { ...typeScale.name },
  body: { ...typeScale.rowSub },
});
