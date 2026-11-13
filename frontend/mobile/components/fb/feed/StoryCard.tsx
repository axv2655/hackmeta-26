import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Story } from '@/lib/mock';
import { colors, fontWeights, hairlineWidth, spacing } from '@/lib/theme';

import { STORY_CARD_BORDER, STORY_CARD_HEIGHT, STORY_CARD_RADIUS, STORY_CARD_WIDTH } from './storyMetrics';

export type StoryCardProps = {
  story: Story;
  /** Overrides `story.seen` (the row tracks which stories were opened this session). */
  seen?: boolean;
  onPress?: (story: Story) => void;
  style?: StyleProp<ViewStyle>;
};

const SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)'] as const;

/** One friend's story: full-bleed frame, ringed avatar top-left, name bottom-left over a scrim. */
export function StoryCard({ story, seen = story.seen, onPress, style }: StoryCardProps) {
  return (
    <PressableScale
      onPress={() => onPress?.(story)}
      accessibilityLabel={`${story.user.name}'s story, ${story.timeLabel} ago${seen ? ', seen' : ''}`}
      style={[styles.card, style]}
    >
      <Image source={story.image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      <LinearGradient colors={SCRIM} style={styles.scrim} />
      <Avatar
        source={story.user.avatar}
        size={28}
        ring={seen ? 'seen' : 'unseen'}
        style={styles.avatar}
      />
      <Text style={styles.name} numberOfLines={2}>
        {story.user.name}
      </Text>
      <View style={styles.border} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: STORY_CARD_WIDTH,
    height: STORY_CARD_HEIGHT,
    borderRadius: STORY_CARD_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.grayButton,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 96,
    pointerEvents: 'none',
  },
  avatar: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  name: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: fontWeights.semibold,
    letterSpacing: -0.2,
    color: colors.white,
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 10,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderRadius: STORY_CARD_RADIUS,
    borderCurve: 'continuous',
    borderWidth: hairlineWidth,
    borderColor: STORY_CARD_BORDER,
    pointerEvents: 'none',
  },
});

export default StoryCard;
