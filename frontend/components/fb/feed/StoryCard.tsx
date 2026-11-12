import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Story } from '@/lib/mock';
import { colors, layout, radii, spacing, type as typeScale } from '@/lib/theme';

export type StoryCardProps = {
  story: Story;
  /** Overrides `story.seen` (the row tracks which stories were opened this session). */
  seen?: boolean;
  onPress?: (story: Story) => void;
  style?: StyleProp<ViewStyle>;
};

const SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)'] as const;

/** One friend's story: full-bleed frame, ringed avatar top-left, name over a bottom scrim. */
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
        size={30}
        ring={seen ? 'seen' : 'unseen'}
        style={styles.avatar}
      />
      <Text style={styles.name} numberOfLines={2}>
        {story.user.name}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: layout.storyCardWidth,
    height: layout.storyCardHeight,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.grayButton,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    pointerEvents: 'none',
  },
  avatar: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  name: {
    ...typeScale.label,
    color: colors.white,
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
  },
});

export default StoryCard;
