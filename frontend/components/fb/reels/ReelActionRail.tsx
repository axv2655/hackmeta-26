import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { tap } from '@/lib/haptics';
import { formatCount, type Reel } from '@/lib/mock';
import { colors, fontWeights, radii, spacing } from '@/lib/theme';

import { EASE_OUT, RAIL_COLUMN_WIDTH, textShadow } from './constants';
import { likeCountFor, useReelsStore, type ReelReaction } from './store';

const ICON_SIZE = 30;
const BUTTON_WIDTH = 56;
const AUDIO_TILE = 30;

type RailButtonProps = {
  icon: IconName;
  label?: string;
  accessibilityLabel: string;
  onPress?: () => void;
};

/** Icon over an optional count. The whole column is the touch target. */
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
        {formatCount(count)}
      </Text>
    </PressableScale>
  );
}

export type ReelActionRailProps = {
  reel: Reel;
  onPressComment?: () => void;
  onPressShare?: () => void;
  onPressMore?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Right-hand column of a reel: like, comment, share, more, and the audio tile. */
function ReelActionRailBase({ reel, onPressComment, onPressShare, onPressMore, style }: ReelActionRailProps) {
  const reaction = useReelsStore((s) => s.reactions[reel.id] ?? null);
  const setReaction = useReelsStore((s) => s.setReaction);

  const toggleLike = () => {
    tap();
    setReaction(reel.id, reaction ? null : 'like');
  };

  return (
    <View style={[styles.rail, style]}>
      <LikeButton reaction={reaction} count={likeCountFor(reel, reaction)} onPress={toggleLike} />
      <RailButton
        icon="comment"
        label={formatCount(reel.commentCount)}
        accessibilityLabel={`${formatCount(reel.commentCount)} comments`}
        onPress={onPressComment}
      />
      <RailButton
        icon="share"
        label={formatCount(reel.shareCount)}
        accessibilityLabel={`Share, ${formatCount(reel.shareCount)} shares`}
        onPress={onPressShare}
      />
      <RailButton icon="more" accessibilityLabel="More options" onPress={onPressMore} />
      <View style={styles.audioTile} accessible={false}>
        <Image source={reel.author.avatar} style={styles.audioImage} contentFit="cover" transition={0} />
      </View>
    </View>
  );
}

export const ReelActionRail = memo(ReelActionRailBase);

const styles = StyleSheet.create({
  rail: {
    width: RAIL_COLUMN_WIDTH,
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    width: BUTTON_WIDTH,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  count: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: fontWeights.semibold,
    color: colors.darkText,
    ...textShadow,
  },
  audioTile: {
    width: AUDIO_TILE,
    height: AUDIO_TILE,
    marginTop: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.darkText,
    overflow: 'hidden',
    backgroundColor: colors.darkBg,
  },
  audioImage: { flex: 1 },
});

export default ReelActionRail;
