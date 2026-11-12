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

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, layout, motion, type as typeScale } from '@/lib/theme';

export type PostActionsProps = {
  liked: boolean;
  onLike: () => void;
  onComment?: () => void;
  onShare?: () => void;
};

const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);
const ICON_SIZE = 24;

type ActionProps = {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress?: () => void;
};

function Action({ icon, label, accessibilityLabel, onPress }: ActionProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      pressedOpacity={0.5}
      accessibilityLabel={accessibilityLabel}
      style={styles.action}
    >
      <Icon name={icon} size={ICON_SIZE} color={colors.textSecondary} />
      <Text style={styles.label}>{label}</Text>
    </PressableScale>
  );
}

/** Like / Comment / Share: three equal 44pt columns. Like pops and turns blue. */
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
          <Icon name="like" size={ICON_SIZE} color={likeColor} filled={liked} />
        </Animated.View>
        <Text style={[styles.label, { color: likeColor }]}>Like</Text>
      </PressableScale>
      <Action icon="comment" label="Comment" accessibilityLabel="Comment" onPress={onComment} />
      <Action icon="share" label="Share" accessibilityLabel="Share" onPress={onShare} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: layout.actionRowHeight,
    backgroundColor: colors.white,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  label: { ...typeScale.action },
});

export default PostActions;
