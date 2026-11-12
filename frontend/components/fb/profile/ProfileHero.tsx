import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatCount, images } from '@/lib/mock';
import type { User } from '@/lib/mock';
import { colors, fontWeights, layout, radii, spacing, type as typeScale } from '@/lib/theme';

import { CameraChip } from './CameraChip';

const COVER_HEIGHT = 200;
const AVATAR_SIZE = 150;
const AVATAR_RING = 4;
const AVATAR_OUTER = AVATAR_SIZE + AVATAR_RING * 2;
/** How much of the profile picture sits on top of the cover. */
const AVATAR_OVERLAP = 96;

export type ProfileHeroProps = {
  user: User;
  friendCount: number;
  bio: string;
  onPressAddToStory?: () => void;
  onPressEditProfile?: () => void;
  onPressMore?: () => void;
  onPressFriends?: () => void;
};

/** Cover photo, overlapping profile picture, name block and the primary button row. */
export function ProfileHero({
  user,
  friendCount,
  bio,
  onPressAddToStory,
  onPressEditProfile,
  onPressMore,
  onPressFriends,
}: ProfileHeroProps) {
  return (
    <View style={styles.root}>
      <View style={styles.cover}>
        <PressableScale
          scaleTo={1}
          pressedOpacity={0.9}
          accessibilityRole="imagebutton"
          accessibilityLabel="Cover photo"
          style={styles.coverPress}
        >
          <Image source={images.cover} style={styles.fill} contentFit="cover" transition={0} />
        </PressableScale>
        <CameraChip accessibilityLabel="Edit cover photo" ring={false} style={styles.coverChip} />
      </View>

      <View style={styles.avatarRow}>
        <View style={styles.avatarWrap}>
          <PressableScale
            scaleTo={0.98}
            pressedOpacity={0.9}
            accessibilityRole="imagebutton"
            accessibilityLabel={`${user.name}, profile picture`}
            style={styles.avatarRing}
          >
            <Image source={user.avatar} style={styles.avatar} contentFit="cover" transition={0} />
          </PressableScale>
          <CameraChip accessibilityLabel="Edit profile picture" style={styles.avatarChip} />
        </View>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} accessibilityRole="header">
          {user.name}
        </Text>
        <PressableScale
          onPress={onPressFriends}
          scaleTo={1}
          pressedOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8 }}
          accessibilityRole="link"
          accessibilityLabel={`${friendCount} friends`}
          style={styles.friendsLink}
        >
          <Text style={styles.friendCount}>
            <Text style={styles.friendCountNumber}>{formatCount(friendCount)}</Text> friends
          </Text>
        </PressableScale>
        <Text style={styles.bio} numberOfLines={1}>
          {bio}
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button
          title="Add to story"
          icon="plus"
          variant="primary"
          onPress={onPressAddToStory}
          style={styles.flexButton}
        />
        <Button
          title="Edit profile"
          icon="pencil"
          variant="secondary"
          onPress={onPressEditProfile}
          style={styles.flexButton}
        />
        <PressableScale
          onPress={onPressMore}
          haptic
          pressedOpacity={0.8}
          hitSlop={{ top: 4, bottom: 4 }}
          accessibilityLabel="More profile options"
          style={styles.moreButton}
        >
          <Icon name="more" size={20} color={colors.text} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  cover: { height: COVER_HEIGHT, backgroundColor: colors.grayButton },
  coverPress: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  coverChip: { position: 'absolute', right: layout.gutter, bottom: layout.gutter },
  // Negative margin pulls the picture up over the cover; pointerEvents lets the
  // cover stay tappable around the round picture.
  avatarRow: {
    marginTop: -AVATAR_OVERLAP,
    paddingHorizontal: layout.gutter - AVATAR_RING,
    flexDirection: 'row',
    pointerEvents: 'box-none',
  },
  avatarWrap: { width: AVATAR_OUTER, height: AVATAR_OUTER },
  avatarRing: {
    width: AVATAR_OUTER,
    height: AVATAR_OUTER,
    borderRadius: AVATAR_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.grayButton,
  },
  avatarChip: { position: 'absolute', right: 6, bottom: 6 },
  info: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  name: { ...typeScale.screenTitle },
  friendsLink: { alignSelf: 'flex-start', marginTop: spacing.xxs },
  friendCount: { ...typeScale.rowSub },
  friendCountNumber: { fontWeight: fontWeights.semibold, color: colors.text },
  bio: { ...typeScale.body, fontSize: 15, lineHeight: 20, marginTop: spacing.sm },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.md + 2,
    paddingBottom: spacing.lg,
  },
  flexButton: { flex: 1 },
  moreButton: {
    width: 44,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.grayButton,
  },
});

export default ProfileHero;
