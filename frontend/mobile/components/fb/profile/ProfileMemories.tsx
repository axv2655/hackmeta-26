import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, spacing, type as typeScale } from '@/lib/theme';

const BADGE = 64;

/** Memories chip: there is nothing from this day yet, so show a calm empty state. */
export function ProfileMemories() {
  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Icon name="history" size={30} color={colors.chipSelectedText} strokeWidth={2} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        No memories today
      </Text>
      <Text style={styles.body}>
        Posts, photos and moves from this day in past years will show up here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    backgroundColor: colors.chipSelectedBg,
  },
  title: { ...typeScale.eventTitle, fontSize: 20, lineHeight: 25 },
  body: { ...typeScale.rowSub, textAlign: 'center' },
});

export default ProfileMemories;
