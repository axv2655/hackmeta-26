import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import type { Audience, Post } from '@/lib/mock';
import { colors, fontWeights, layout, spacing } from '@/lib/theme';

export type PostHeaderProps = {
  post: Post;
  onPressMore?: () => void;
  /** Called by the X button, which only shows for `post.dismissible` posts. */
  onDismiss?: () => void;
};

const AVATAR_SIZE = 42;

const AUDIENCE: Record<Audience, { icon: IconName; label: string }> = {
  public: { icon: 'globe', label: 'Public' },
  friends: { icon: 'friends', label: 'Friends' },
  group: { icon: 'users', label: 'Group members' },
  'only-me': { icon: 'lock', label: 'Only me' },
};

/**
 * Avatar, one-line name ("Name is at Place", "Name ▸ Group", or name + verified check),
 * "23h · audience" meta, then "..." and X flush right.
 */
export function PostHeader({ post, onPressMore, onDismiss }: PostHeaderProps) {
  const { author, group, placeName } = post;
  const audience = AUDIENCE[post.audience];
  const isRich = group != null || placeName != null;

  return (
    <View style={styles.header}>
      <Avatar source={author.avatar} size={AVATAR_SIZE} />
      <View style={styles.titles}>
        {isRich ? (
          <Text style={styles.name} numberOfLines={1}>
            {author.name}
            {group ? (
              <>
                <Text style={styles.arrow}>{' ▸ '}</Text>
                {group.name}
              </>
            ) : null}
            {placeName ? (
              <>
                <Text style={styles.connector}> is at </Text>
                {placeName}
              </>
            ) : null}
          </Text>
        ) : (
          <View style={styles.nameRow}>
            <Text style={[styles.name, styles.shrink]} numberOfLines={1}>
              {author.name}
            </Text>
            {author.verified ? <VerifiedBadge size={15} style={styles.verified} /> : null}
          </View>
        )}
        <View
          style={styles.metaRow}
          accessible
          accessibilityLabel={`${post.timeLabel}, shared with ${audience.label}`}
        >
          <Text style={styles.meta}>{post.timeLabel.replace(' ', '')}</Text>
          <Text style={styles.dot}>·</Text>
          <Icon name={audience.icon} size={14} color={colors.textSecondary} strokeWidth={2.2} />
        </View>
      </View>
      <View style={styles.actions}>
        <IconButton
          name="more"
          size={22}
          color={colors.textSecondary}
          hitSize={40}
          accessibilityLabel={`More options for ${author.name}'s post`}
          onPress={onPressMore}
        />
        {post.dismissible ? (
          <IconButton
            name="close"
            size={24}
            color={colors.textSecondary}
            hitSize={40}
            accessibilityLabel="Hide post"
            onPress={onDismiss}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingRight: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  titles: {
    flex: 1,
    minHeight: AVATAR_SIZE,
    justifyContent: 'center',
    marginLeft: 10,
    gap: 1,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeights.semibold,
    letterSpacing: -0.3,
    color: colors.text,
  },
  shrink: { flexShrink: 1 },
  verified: { marginLeft: spacing.xs },
  arrow: { fontSize: 13, color: colors.textSecondary, fontWeight: fontWeights.regular },
  connector: { fontWeight: fontWeights.regular },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  dot: { fontSize: 14, lineHeight: 18, color: colors.textSecondary, fontWeight: fontWeights.bold },
  // "..." and X sit beside the name line, not centered on the whole header.
  actions: { flexDirection: 'row', alignSelf: 'flex-start', marginTop: -6 },
});

export default PostHeader;
