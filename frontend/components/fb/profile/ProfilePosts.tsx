import { Fragment, useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Hairline } from '@/components/ui/Hairline';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { SectionBand } from '@/components/ui/SectionBand';
import { selection } from '@/lib/haptics';
import { isPost } from '@/lib/mock';
import type { Post, User } from '@/lib/mock';
import { useFeedStore } from '@/lib/store/feed';
import { colors, layout, radii, spacing, type as typeScale } from '@/lib/theme';

import { matchesFilter, ownSeedPosts, postFilters, type PostFilterKey } from './data';
import { ProfilePostCard } from './ProfilePostCard';
import { sectionStyles } from './sectionStyles';

export type ProfilePostsProps = {
  user: User;
  onPressCompose?: () => void;
};

/**
 * "Posts" section: mini composer, filter chips, then the user's own posts.
 * Posts created in the app (feed store) come first, followed by seeded history.
 */
export function ProfilePosts({ user, onPressCompose }: ProfilePostsProps) {
  const feed = useFeedStore((s) => s.posts);
  const toggleStoreLike = useFeedStore((s) => s.toggleLike);
  const [seedPosts, setSeedPosts] = useState<Post[]>(ownSeedPosts);
  const [filter, setFilter] = useState<PostFilterKey>('all');

  const storePosts = useMemo(
    () => feed.filter((item): item is Post => isPost(item) && item.author.id === user.id),
    [feed, user.id],
  );

  const toggleSeedLike = useCallback((postId: string) => {
    setSeedPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, liked: !post.liked, likeCount: Math.max(0, post.likeCount + (post.liked ? -1 : 1)) }
          : post,
      ),
    );
  }, []);

  const visible = useMemo(
    () => [
      ...storePosts.filter((post) => matchesFilter(post, filter)).map((post) => ({ post, local: false })),
      ...seedPosts.filter((post) => matchesFilter(post, filter)).map((post) => ({ post, local: true })),
    ],
    [storePosts, seedPosts, filter],
  );

  return (
    <View style={styles.root}>
      <View style={styles.headingRow}>
        <Text style={sectionStyles.heading} accessibilityRole="header">
          Posts
        </Text>
        <IconButton name="settings" size={22} accessibilityLabel="Manage posts" />
      </View>

      <View style={styles.composer}>
        <Avatar source={user.avatar} size={layout.avatar} />
        <PressableScale
          onPress={onPressCompose}
          scaleTo={1}
          pressedOpacity={0.6}
          accessibilityLabel="Create a post"
          style={styles.prompt}
        >
          <Text style={styles.promptText}>What&apos;s on your mind?</Text>
        </PressableScale>
        <IconButton
          name="photo"
          size={26}
          color={colors.textSecondary}
          accessibilityLabel="Add a photo"
          onPress={onPressCompose}
        />
      </View>

      <Hairline />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        accessibilityRole="tablist"
      >
        {postFilters.map((option) => {
          const selected = option.key === filter;
          return (
            <PressableScale
              key={option.key}
              onPress={() => {
                if (!selected) selection();
                setFilter(option.key);
              }}
              pressedOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6 }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={[styles.chip, selected && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{option.label}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>

      {visible.length === 0 ? (
        <>
          <Hairline />
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No posts to show</Text>
            <Text style={styles.emptyBody}>Posts that match this filter will appear here.</Text>
          </View>
        </>
      ) : (
        visible.map(({ post, local }) => (
          <Fragment key={post.id}>
            <SectionBand />
            <ProfilePostCard
              post={post}
              onToggleLike={() => (local ? toggleSeedLike(post.id) : toggleStoreLike(post.id))}
            />
          </Fragment>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.gutter,
    paddingRight: spacing.xs,
    paddingTop: spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingLeft: layout.gutter,
    paddingRight: spacing.xs,
    gap: spacing.sm + 2,
  },
  prompt: { flex: 1, height: layout.hitTarget, justifyContent: 'center' },
  promptText: { ...typeScale.prompt },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.md,
  },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.grayButton,
  },
  chipActive: { backgroundColor: colors.tintBg },
  chipLabel: { ...typeScale.button },
  chipLabelActive: { color: colors.tintText },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
    gap: spacing.xs,
  },
  emptyTitle: { ...typeScale.sectionTitle },
  emptyBody: { ...typeScale.rowSub, textAlign: 'center' },
});

export default ProfilePosts;
