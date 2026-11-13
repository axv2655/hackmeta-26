import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { formatCount } from '@/lib/mock';
import type { User } from '@/lib/mock';
import { colors, fontWeights, layout, radius, shadows, spacing, type as typeScale } from '@/lib/theme';

import { CameraChip } from './CameraChip';
import { profileNotePrompt } from './data';

/** Soft gray wash behind the top of the profile (dark at the status bar, light at the sheet). */
const GRADIENT = ['#77787C', '#A6A7AB', '#D6D7DA'] as const;

const NOTE_TOP = spacing.xs;
const NOTE_HEIGHT = 40;
/** How far the note bubble overlaps the top of the profile picture. */
const NOTE_OVERLAP = 26;

const PHOTO_RING = 3;
const PHOTO_OUTER = 176;
const PHOTO_SIZE = PHOTO_OUTER - PHOTO_RING * 2;
const PHOTO_TOP = NOTE_TOP + NOTE_HEIGHT - NOTE_OVERLAP;
const PHOTO_CENTER = PHOTO_TOP + PHOTO_OUTER / 2;

/** Top of the white sheet, measured from the bottom of the top bar. */
export const HERO_SHEET_TOP = PHOTO_CENTER + 30;
const SHEET_RADIUS = 32;
const STAGE_HEIGHT = PHOTO_TOP + PHOTO_OUTER;

const COVER_CHIP = 40;
const CHEVRON_SIZE = 34;
const COMMON_AVATAR = 34;

export type ProfileHeroProps = {
  user: User;
  friendCount: number;
  /** Space the floating top bar covers (safe-area top + bar height). The gradient runs under it. */
  topInset: number;
  /** Up to three friends for the "Friends with things in common" row. The third shows a "more" scrim. */
  commonFriends: User[];
  /** Kept for API compatibility; the new hero does not show the bio. */
  bio?: string;
  /** Each optional control is hidden when its handler is not passed. */
  onPressNote?: () => void;
  onPressCover?: () => void;
  onPressPhoto?: () => void;
  onPressAddToStory?: () => void;
  onPressEditProfile?: () => void;
  /** Gray chevron button next to the name (profile switcher / options). */
  onPressMore?: () => void;
  onPressFriends?: () => void;
  onPressCommonFriends?: () => void;
};

/**
 * Gradient top area with a note bubble, a big centered profile picture rising out of a
 * rounded white sheet, the centered name block, common friends and the two primary buttons.
 */
export function ProfileHero({
  user,
  friendCount,
  topInset,
  commonFriends,
  onPressNote,
  onPressCover,
  onPressPhoto,
  onPressAddToStory,
  onPressEditProfile,
  onPressMore,
  onPressFriends,
  onPressCommonFriends,
}: ProfileHeroProps) {
  const common = commonFriends.slice(0, 3);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={GRADIENT}
        locations={[0, 0.55, 1]}
        style={[styles.gradient, { height: topInset + HERO_SHEET_TOP + SHEET_RADIUS }]}
      />

      <View style={[styles.stage, { marginTop: topInset }]}>
        <View style={styles.sheet} />

        {onPressCover ? (
          <CameraChip
            variant="glyph"
            size={COVER_CHIP}
            accessibilityLabel="Edit cover photo"
            onPress={onPressCover}
            style={styles.coverChip}
          />
        ) : null}

        <View style={styles.photoWrap}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${user.name}, profile picture`}
            style={styles.photoRing}
          >
            <Image source={user.avatar} style={styles.photo} contentFit="cover" transition={0} />
          </View>
          {onPressPhoto ? (
            <CameraChip accessibilityLabel="Edit profile picture" onPress={onPressPhoto} style={styles.photoChip} />
          ) : null}
        </View>

        {onPressNote ? (
          <PressableScale
            onPress={onPressNote}
            scaleTo={0.96}
            pressedOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Add a note. ${profileNotePrompt}`}
            style={styles.note}
          >
            <Text style={styles.noteText} numberOfLines={1}>
              {profileNotePrompt}
            </Text>
            <View style={styles.noteTail} />
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.nameRow}>
        <View style={styles.nameLine}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
            {user.name}
          </Text>
          {user.verified ? <VerifiedBadge size={22} style={styles.verified} /> : null}
        </View>
        {onPressMore ? (
          <PressableScale
            onPress={onPressMore}
            haptic
            scaleTo={0.92}
            pressedOpacity={0.8}
            hitSlop={5}
            accessibilityRole="button"
            accessibilityLabel="Profile options"
            style={styles.chevron}
          >
            <Icon name="chevron-down" size={20} color={colors.text} />
          </PressableScale>
        ) : null}
      </View>

      <PressableScale
        onPress={onPressFriends}
        scaleTo={1}
        pressedOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="link"
        accessibilityLabel={`${friendCount} friends`}
        style={styles.friendsLink}
      >
        <Text style={styles.friendCount}>{formatCount(friendCount)} friends</Text>
      </PressableScale>

      {common.length > 0 ? (
        <PressableScale
          onPress={onPressCommonFriends}
          scaleTo={1}
          pressedOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Friends with things in common"
          style={styles.commonRow}
        >
          <View style={styles.commonAvatars}>
            {common.map((friend, index) => {
              const isMore = index === 2;
              return (
                <View
                  key={friend.id}
                  style={[styles.commonAvatar, index > 0 && styles.commonOverlap, { zIndex: 3 - index }]}
                >
                  <Image source={friend.avatar} style={styles.fill} contentFit="cover" transition={0} />
                  {isMore ? (
                    <View style={styles.commonMore}>
                      <Icon name="more" size={18} color={colors.white} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Text style={styles.commonText} numberOfLines={1}>
            Friends with things in common
          </Text>
        </PressableScale>
      ) : null}

      <View style={styles.buttons}>
        {onPressAddToStory ? (
          <PressableScale
            onPress={onPressAddToStory}
            haptic
            scaleTo={0.97}
            pressedOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add to story"
            style={[styles.button, styles.buttonPrimary]}
          >
            <Icon name="plus-circle" size={20} color={colors.white} strokeWidth={2.2} />
            <Text style={[styles.buttonText, styles.buttonTextPrimary]} numberOfLines={1}>
              Add to story
            </Text>
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={onPressEditProfile}
          haptic
          scaleTo={0.97}
          pressedOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          style={[styles.button, styles.buttonSecondary]}
        >
          <Icon name="pencil" size={19} color={colors.text} strokeWidth={2.4} />
          <Text style={styles.buttonText} numberOfLines={1}>
            Edit profile
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0 },
  fill: { width: '100%', height: '100%' },

  stage: { height: STAGE_HEIGHT, alignItems: 'center' },
  sheet: {
    position: 'absolute',
    top: HERO_SHEET_TOP,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderCurve: 'continuous',
  },
  coverChip: {
    position: 'absolute',
    right: spacing.lg,
    top: HERO_SHEET_TOP - COVER_CHIP - spacing.sm,
  },

  photoWrap: {
    position: 'absolute',
    top: PHOTO_TOP,
    width: PHOTO_OUTER,
    height: PHOTO_OUTER,
  },
  photoRing: {
    width: PHOTO_OUTER,
    height: PHOTO_OUTER,
    borderRadius: PHOTO_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: colors.grayButton,
  },
  photoChip: { position: 'absolute', right: 10, bottom: 10 },

  note: {
    position: 'absolute',
    top: NOTE_TOP,
    height: NOTE_HEIGHT,
    paddingHorizontal: spacing.lg + 2,
    borderRadius: NOTE_HEIGHT / 2,
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadows.card,
  },
  noteText: { ...typeScale.rowSub, fontSize: 16, lineHeight: 21 },
  noteTail: {
    position: 'absolute',
    bottom: -4,
    left: '36%',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.white,
  },

  nameRow: {
    marginTop: spacing.md + 2,
    minHeight: CHEVRON_SIZE + spacing.sm,
    paddingHorizontal: CHEVRON_SIZE + layout.gutter + spacing.sm,
    justifyContent: 'center',
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verified: { marginLeft: spacing.xs },
  name: {
    flexShrink: 1,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
    color: colors.text,
    textAlign: 'center',
  },
  chevron: {
    position: 'absolute',
    right: layout.gutter,
    top: spacing.xs,
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    borderRadius: CHEVRON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.buttonSecondary,
  },
  friendsLink: { alignSelf: 'center', marginTop: spacing.xxs },
  friendCount: {
    ...typeScale.name,
    fontSize: 16,
    fontWeight: fontWeights.semibold,
  },

  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg + 2,
    paddingHorizontal: layout.gutter,
  },
  commonAvatars: { flexDirection: 'row', alignItems: 'center' },
  commonAvatar: {
    width: COMMON_AVATAR,
    height: COMMON_AVATAR,
    borderRadius: COMMON_AVATAR / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.grayButton,
  },
  commonOverlap: { marginLeft: -6 },
  commonMore: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  commonText: { ...typeScale.body, fontSize: 15, lineHeight: 20, flex: 1 },

  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    height: layout.hitTarget,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonPrimary: { backgroundColor: colors.blue },
  buttonSecondary: { backgroundColor: colors.buttonSecondary },
  buttonText: { ...typeScale.buttonLarge, fontSize: 16, lineHeight: 21 },
  buttonTextPrimary: { color: colors.white },
});

export default ProfileHero;
