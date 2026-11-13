import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import BookmarkGlyph from 'lucide-react-native/icons/bookmark';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection, tap } from '@/lib/haptics';
import { formatCount } from '@/lib/mock';
import { useReels, type FeedReel } from '@/lib/reels';
import { colors, fontWeights } from '@/lib/theme';

import { EASE_OUT, RAIL_COLUMN_WIDTH, textShadow } from './constants';
import { likeCountFor, reactionFor, saveCountFor, useReelsStore, type ReelReaction } from './store';

const ICON_SIZE = 32;
const BUTTON_WIDTH = 60;

/** Rail counts read "102K" / "5.4K", capitalized like the iOS app. */
function railCount(n: number): string {
  return formatCount(n).toUpperCase();
}

type RailButtonProps = {
  icon: IconName;
  label?: string;
  accessibilityLabel: string;
  onPress?: () => void;
};

/** Outline icon over an optional count. The whole column is the touch target. */
function RailButton({ icon, label, accessibilityLabel, onPress }: RailButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      pressedOpacity={0.6}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    >
      <Icon name={icon} size={ICON_SIZE} color={colors.darkText} />
      {label != null ? (
        <Text style={styles.count} numberOfLines={1} allowFontScaling={false}>
          {label}
        </Text>
      ) : null}
    </PressableScale>
  );
}

type LikeButtonProps = {
  reaction: ReelReaction | null;
  count: number;
  onPress: () => void;
};

/**
 * Like toggle. Outline thumb at rest, filled blue thumb when liked, filled red
 * heart when loved (double tap on the media). The glyph pops whenever a
 * reaction lands, never when one is removed.
 */
function LikeButton({ reaction, count, onPress }: LikeButtonProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const previous = useRef(reaction);

  useEffect(() => {
    const before = previous.current;
    previous.current = reaction;
    if (reaction == null || reaction === before || reduceMotion) return;
    scale.set(
      withSequence(
        withTiming(1.3, { duration: 110, easing: EASE_OUT }),
        withSpring(1, { duration: 260, dampingRatio: 0.5 }),
      ),
    );
  }, [reaction, reduceMotion, scale]);

  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const icon: IconName = reaction === 'love' ? 'heart' : 'like';
  const color = reaction === 'love' ? colors.love : reaction === 'like' ? colors.blue : colors.darkText;

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      pressedOpacity={0.6}
      accessibilityLabel={reaction ? 'Remove reaction' : 'Like'}
      accessibilityState={{ selected: reaction != null }}
      style={styles.button}
    >
      <Animated.View style={glyphStyle}>
        <Icon name={icon} filled={reaction != null} size={ICON_SIZE} color={color} />
      </Animated.View>
      <Text style={styles.count} numberOfLines={1} allowFontScaling={false}>
        {railCount(count)}
      </Text>
    </PressableScale>
  );
}

type SaveButtonProps = {
  saved: boolean;
  count: number;
  onPress: () => void;
};

/** Bookmark toggle: outline at rest, filled white once saved. */
function SaveButton({ saved, count, onPress }: SaveButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      pressedOpacity={0.6}
      accessibilityLabel={saved ? 'Remove from saved' : `Save, ${railCount(count)} saves`}
      accessibilityState={{ selected: saved }}
      style={styles.button}
    >
      <BookmarkGlyph
        size={ICON_SIZE - 2}
        color={colors.darkText}
        fill={saved ? colors.darkText : 'none'}
        strokeWidth={1.9}
      />
      <Text style={styles.count} numberOfLines={1} allowFontScaling={false}>
        {railCount(count)}
      </Text>
    </PressableScale>
  );
}

export type ReelActionRailProps = {
  reel: FeedReel;
  onPressComment?: () => void;
  onPressShare?: () => void;
  onPressMore?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Right-hand column of a reel: like, comment, share and save with counts, then "more" at the bottom. */
function ReelActionRailBase({ reel, onPressComment, onPressShare, onPressMore, style }: ReelActionRailProps) {
  const reaction = useReelsStore((s) => reactionFor(s, reel));
  const setReaction = useReelsStore((s) => s.setReaction);
  const toggleSave = useReels((s) => s.toggleSave);
  const saved = reel.saved;

  const onToggleSave = () => {
    selection();
    void toggleSave(reel.id);
  };

  const toggleLike = () => {
    tap();
    setReaction(reel.id, reaction ? null : 'like');
  };

  return (
    <View style={[styles.rail, style]}>
      <LikeButton reaction={reaction} count={likeCountFor(reel, reaction)} onPress={toggleLike} />
      <RailButton
        icon="comment"
        label={railCount(reel.commentCount)}
        accessibilityLabel={`${formatCount(reel.commentCount)} comments`}
        onPress={onPressComment}
      />
      <RailButton
        icon="share"
        label={railCount(reel.shareCount)}
        accessibilityLabel={`Share, ${formatCount(reel.shareCount)} shares`}
        onPress={onPressShare}
      />
      <SaveButton saved={saved} count={saveCountFor(reel, saved)} onPress={onToggleSave} />
      <PressableScale
        onPress={onPressMore}
        scaleTo={0.9}
        pressedOpacity={0.6}
        accessibilityLabel="More options"
        style={styles.moreButton}
      >
        <Icon name="more" size={28} color={colors.darkText} />
      </PressableScale>
    </View>
  );
}

export const ReelActionRail = memo(ReelActionRailBase);

const styles = StyleSheet.create({
  rail: {
    width: RAIL_COLUMN_WIDTH,
    alignItems: 'center',
    gap: 18,
  },
  button: {
    width: BUTTON_WIDTH,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  count: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: fontWeights.semibold,
    color: colors.darkText,
    ...textShadow,
  },
  moreButton: {
    width: BUTTON_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ReelActionRail;
