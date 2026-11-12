import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import type { Audience, Post } from '@/lib/mock';
import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

export type PostHeaderProps = {
  post: Post;
  onPressMore?: () => void;
  /** Called by the X button, which only shows for `post.dismissible` posts. */
  onDismiss?: () => void;
};

const AUDIENCE: Record<Audience, { icon: IconName; label: string }> = {
  public: { icon: 'globe', label: 'Public' },
  friends: { icon: 'friends', label: 'Friends' },
  group: { icon: 'users', label: 'Group members' },
  'only-me': { icon: 'lock', label: 'Only me' },
};

/** Avatar, name line (with verified check, group or check-in), "4 m · audience" meta, "..." and X. */
export function PostHeader({ post, onPressMore, onDismiss }: PostHeaderProps) {
  const { author, group, placeName } = post;
  const audience = AUDIENCE[post.audience];
  const isRich = group != null || placeName != null;

  return (
    <View style={styles.header}>
      <Avatar source={author.avatar} size={layout.avatar} />
      <View style={styles.titles}>
        {isRich ? (
          <Text style={styles.name} numberOfLines={2}>
            {author.name}
            {group ? (
              <>
                <Text style={styles.arrow}>{'  ▸  '}</Text>
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
            {author.verified ? <VerifiedBadge size={14} style={styles.verified} /> : null}
          </View>
        )}
        <View
          style={styles.metaRow}
          accessible
          accessibilityLabel={`${post.timeLabel}, shared with ${audience.label}`}
        >
          <Text style={styles.meta}>{`${post.timeLabel} · `}</Text>
          <Icon
            name={audience.icon}
            size={12}
            color={colors.textSecondary}
            strokeWidth={2.4}
            style={styles.audienceIcon}
          />
        </View>
      </View>
      <View style={styles.actions}>
        <IconButton
          name="more"
          size={24}
          color={colors.textSecondary}
          accessibilityLabel={`More options for ${author.name}'s post`}
          onPress={onPressMore}
        />
        {post.dismissible ? (
          <IconButton
            name="close"
            size={26}
            color={colors.textSecondary}
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
    alignItems: 'flex-start',
    paddingLeft: layout.gutter,
    paddingTop: spacing.md,
    paddingBottom: 10,
  },
  titles: {
    flex: 1,
    minHeight: layout.avatar,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    gap: spacing.xxs,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { ...typeScale.name },
  shrink: { flexShrink: 1 },
  verified: { marginLeft: spacing.xs },
  arrow: { fontSize: 13, color: colors.textSecondary, fontWeight: fontWeights.regular },
  connector: { fontWeight: fontWeights.regular },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  meta: { ...typeScale.meta },
  audienceIcon: { marginTop: 1 },
  // The 44pt buttons sit flush right and are pulled up so their glyphs line up with the name.
  actions: { flexDirection: 'row', marginTop: -10 },
});

export default PostHeader;
