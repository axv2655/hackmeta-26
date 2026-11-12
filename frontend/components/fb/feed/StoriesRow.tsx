import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { stories as mockStories, type Story } from '@/lib/mock';
import { colors, layout, spacing } from '@/lib/theme';

import { CreateStoryCard } from './CreateStoryCard';
import { StoryCard } from './StoryCard';

export type StoriesRowProps = {
  /** Defaults to the seeded stories. */
  stories?: Story[];
  onPressCreate?: () => void;
  onPressStory?: (story: Story) => void;
  style?: StyleProp<ViewStyle>;
};

/** Horizontal strip of story cards, led by the "Create story" card. */
export function StoriesRow({ stories = mockStories, onPressCreate, onPressStory, style }: StoriesRowProps) {
  // There is no story viewer yet: opening a story just marks its ring as seen.
  const [opened, setOpened] = useState<readonly string[]>([]);

  const handlePressStory = useCallback(
    (story: Story) => {
      setOpened((ids) => (ids.includes(story.id) ? ids : [...ids, story.id]));
      onPressStory?.(story);
    },
    [onPressStory],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, style]}
      contentContainerStyle={styles.content}
    >
      <CreateStoryCard onPress={onPressCreate} />
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          seen={story.seen || opened.includes(story.id)}
          onPress={handlePressStory}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, backgroundColor: colors.white },
  content: {
    paddingHorizontal: layout.storyEdgeInset,
    paddingVertical: spacing.md,
    gap: layout.storyCardGap,
  },
});

export default StoriesRow;
