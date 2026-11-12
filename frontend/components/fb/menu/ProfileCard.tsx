import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { User } from '@/lib/mock';
import { colors, fontWeights, layout, radii, shadows, spacing, type as typeScale } from '@/lib/theme';

export type ProfileCardProps = {
  user: User;
  onPress?: () => void;
};

const SWITCH_SIZE = 32;

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
      <Avatar source={user.avatar} size={layout.avatar} />
      <Text style={styles.name} numberOfLines={1}>
        {user.name}
      </Text>
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
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadows.card,
  },
  name: { ...typeScale.row, fontWeight: fontWeights.semibold, flex: 1 },
  switch: {
    width: SWITCH_SIZE,
    height: SWITCH_SIZE,
    borderRadius: SWITCH_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.grayButton,
  },
});

export default ProfileCard;
