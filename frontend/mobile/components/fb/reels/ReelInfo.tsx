import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { selection } from '@/lib/haptics';
import type { FeedReel } from '@/lib/reels';
import { colors, fontWeights, radius, spacing } from '@/lib/theme';

import { textShadow } from './constants';
import { PlaceChip } from './PlaceChip';
import { followingFor, useReelsStore } from './store';

/** Photo diameter. The blue ring and its gap bring the avatar to about 51pt. */
const AVATAR_SIZE = 42;
const RING_WIDTH = 2.5;
const RING_GAP = 2;
const FOLLOW_HEIGHT = 30;
const CAPTION_FONT_SIZE = 16;
const CAPTION_LINE_HEIGHT = 21;
/** Average glyph advance of the system font at 16pt, rounded up so the estimate stays on the safe side. */
const AVG_CHAR_WIDTH = 8.1;
/** Characters held back on the line for the trailing "... more". */
const MORE_RESERVE = 7;

/**
 * Cut a caption so that it and a trailing "... more" fit on one line of
 * `columnWidth`. Text cannot be measured before layout on web, so this is an
 * estimate; `numberOfLines={1}` on the Text is the hard clamp behind it.
 */
function clampCaption(caption: string, columnWidth: number): { text: string; truncated: boolean } {
  const maxChars = Math.max(16, Math.floor(columnWidth / AVG_CHAR_WIDTH) - MORE_RESERVE);
  if (caption.length <= maxChars) return { text: caption, truncated: false };

  const cut = caption.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const atWord = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return { text: atWord.replace(/[\s.,;:!?-]+$/, ''), truncated: true };
}

export type ReelInfoProps = {
  reel: FeedReel;
  /** Width available to the block (the page width minus the gutter and the action rail). */
  width: number;
  /** The caption collapses again when the reel stops being the active page. */
  active: boolean;
  onPressAuthor?: () => void;
  onPressPlace?: () => void;
  onPressAudio?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Bottom-left block of a reel: ringed avatar, name + globe, Follow, place chip, caption, gray audio subline. */
function ReelInfoBase({ reel, width, active, onPressAuthor, onPressPlace, onPressAudio, style }: ReelInfoProps) {
  const following = useReelsStore((s) => followingFor(s, reel));
  const toggleFollow = useReelsStore((s) => s.toggleFollow);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);

  const clamped = useMemo(() => clampCaption(reel.caption, width), [reel.caption, width]);

  const onToggleFollow = () => {
    selection();
    toggleFollow(reel.author.id, following);
  };

  return (
    <View style={[styles.block, { width }, style]}>
      <View style={styles.authorRow}>
        <View style={styles.ring}>
          <Avatar
            source={reel.author.avatar}
            size={AVATAR_SIZE}
            onPress={onPressAuthor ?? noop}
            accessibilityLabel={`${reel.author.name}'s profile`}
          />
        </View>
        <View style={styles.nameWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {reel.author.name}
          </Text>
        </View>
        {reel.author.verified ? <VerifiedBadge size={14} /> : null}
        <Icon name="globe" size={15} color={colors.darkText} accessibilityLabel="Public" />
        <PressableScale
          onPress={onToggleFollow}
          scaleTo={0.94}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessibilityLabel={following ? `Unfollow ${reel.author.name}` : `Follow ${reel.author.name}`}
          accessibilityState={{ selected: following }}
          style={[styles.followButton, following && styles.followingButton]}
        >
          <Text style={[styles.follow, following && styles.following]} numberOfLines={1}>
            {following ? 'Following' : 'Follow'}
          </Text>
        </PressableScale>
      </View>

      {reel.mark || reel.placeHint ? (
        <PlaceChip
          placeName={reel.mark?.name ?? reel.placeHint ?? ''}
          distanceMi={reel.distanceMi}
          unresolved={!reel.mark && !reel.sample}
          onPress={onPressPlace}
          style={styles.chip}
        />
      ) : null}

      {clamped.truncated ? (
        <PressableScale
          onPress={() => setExpanded((value) => !value)}
          scaleTo={1}
          pressedOpacity={0.75}
          accessibilityLabel={reel.caption}
          accessibilityHint={expanded ? 'Collapses the caption' : 'Expands the caption'}
        >
          <Text style={styles.caption} numberOfLines={expanded ? undefined : 1}>
            {expanded ? reel.caption : `${clamped.text}… `}
            {expanded ? null : <Text style={styles.more}>more</Text>}
          </Text>
        </PressableScale>
      ) : (
        <Text style={styles.caption} numberOfLines={2}>
          {reel.caption}
        </Text>
      )}

      <PressableScale
        onPress={onPressAudio ?? noop}
        scaleTo={1}
        pressedOpacity={0.6}
        hitSlop={{ top: 6, bottom: 12, left: 0, right: 12 }}
        accessibilityLabel={`Audio: ${reel.audio}`}
        style={styles.audioRow}
      >
        <Icon name="music" size={13} color={colors.darkTextSecondary} strokeWidth={2.25} />
        <View style={styles.audioWrap}>
          <Text style={styles.audio} numberOfLines={1}>
            {reel.audio}
          </Text>
        </View>
      </PressableScale>
    </View>
  );
}

function noop() {}

export const ReelInfo = memo(ReelInfoBase);

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm + 2,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xxs,
  },
  ring: {
    padding: RING_GAP,
    borderRadius: (AVATAR_SIZE + (RING_GAP + RING_WIDTH) * 2) / 2,
    borderWidth: RING_WIDTH,
    borderColor: colors.blue,
  },
  nameWrap: {
    flexShrink: 1,
    marginLeft: spacing.xs,
  },
  name: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeights.semibold,
    color: colors.darkText,
    ...textShadow,
  },
  followButton: {
    height: FOLLOW_HEIGHT,
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.md - 2,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  followingButton: {
    borderColor: colors.darkHairline,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  follow: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: fontWeights.semibold,
    color: colors.darkText,
  },
  following: {
    color: colors.darkTextSecondary,
  },
  chip: {
    marginBottom: spacing.xxs,
  },
  caption: {
    fontSize: CAPTION_FONT_SIZE,
    lineHeight: CAPTION_LINE_HEIGHT,
    fontWeight: fontWeights.regular,
    color: colors.darkText,
    ...textShadow,
  },
  more: {
    fontWeight: fontWeights.semibold,
    color: colors.darkText,
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    minHeight: 20,
  },
  audioWrap: { flexShrink: 1 },
  audio: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeights.regular,
    color: colors.darkTextSecondary,
    ...textShadow,
  },
});

export default ReelInfo;
