import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { User } from '@/lib/mock';
import { colors, fontWeights, radius, shadows, spacing, type as typeScale } from '@/lib/theme';

export type ProfileCardProps = {
  user: User;
  onPress?: () => void;
};

const SWITCH_SIZE = 32;
const AVATAR = 48;

/** White card at the top of the Menu: who you are, with the "switch profile" chevron. */
export function ProfileCard({ user, onPress }: ProfileCardProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      haptic
      accessibilityRole="button"
      accessibilityLabel={`${user.name}, go to your profile`}
      style={styles.card}
    >
      <Avatar source={user.avatar} size={AVATAR} />
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          See your profile
        </Text>
      </View>
      <View style={styles.switch}>
        <Icon name="chevron-down" size={18} color={colors.text} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    ...shadows.card,
  },
  texts: { flex: 1, gap: spacing.xxs },
  name: { ...typeScale.row, fontWeight: fontWeights.semibold },
  sub: { ...typeScale.rowSub },
  switch: {
    width: SWITCH_SIZE,
    height: SWITCH_SIZE,
    borderRadius: SWITCH_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.buttonSecondary,
  },
});

export default ProfileCard;
