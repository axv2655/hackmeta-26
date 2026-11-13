import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { SFSymbol } from 'expo-symbols';

import type { IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, layout, motion, spacing } from '@/lib/theme';

import { FeedSymbol } from './FeedSymbol';

export type PostActionsProps = {
  liked: boolean;
  onLike: () => void;
  onComment?: () => void;
  onShare?: () => void;
};

const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);
const ICON_SIZE = 20;

type ActionProps = {
  symbol: SFSymbol;
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress?: () => void;
};

function Action({ symbol, icon, label, accessibilityLabel, onPress }: ActionProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      pressedOpacity={0.5}
      accessibilityLabel={accessibilityLabel}
      style={styles.action}
    >
      <FeedSymbol name={symbol} fallback={icon} size={ICON_SIZE} color={colors.textSecondary} />
      <Text style={styles.label}>{label}</Text>
    </PressableScale>
  );
}

/** Like / Comment / Share: three equal columns of SF Symbol + label. Like pops and turns blue. */
export function PostActions({ liked, onLike, onComment, onShare }: PostActionsProps) {
  const pop = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.get() }],
  }));

  const handleLike = useCallback(() => {
    // Feedback for the tap that adds the like; removing one just swaps the icon back.
    if (!liked && !reduceMotion) {
      pop.set(
        withSequence(
          withTiming(1.28, { duration: 90, easing: EASE_OUT }),
          withTiming(1, { duration: motion.fast, easing: EASE_OUT }),
        ),
      );
    }
    onLike();
  }, [liked, onLike, pop, reduceMotion]);

  const likeColor = liked ? colors.blue : colors.textSecondary;

  return (
    <View style={styles.row}>
      <PressableScale
        onPress={handleLike}
        haptic
        scaleTo={0.96}
        pressedOpacity={0.5}
        accessibilityLabel={liked ? 'Remove like' : 'Like'}
        accessibilityState={{ selected: liked }}
        style={styles.action}
      >
        <Animated.View style={thumbStyle}>
          <FeedSymbol
            name={liked ? 'hand.thumbsup.fill' : 'hand.thumbsup'}
            fallback="like"
            filled={liked}
            size={ICON_SIZE}
            color={likeColor}
          />
        </Animated.View>
        <Text style={[styles.label, { color: likeColor }]}>Like</Text>
      </PressableScale>
      <Action symbol="bubble.right" icon="comment" label="Comment" accessibilityLabel="Comment" onPress={onComment} />
      <Action
        symbol="arrowshape.turn.up.right"
        icon="share"
        label="Share"
        accessibilityLabel="Share"
        onPress={onShare}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: layout.actionRowHeight,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: colors.white,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: fontWeights.medium,
    letterSpacing: -0.2,
    color: colors.textSecondary,
  },
});

export default PostActions;
