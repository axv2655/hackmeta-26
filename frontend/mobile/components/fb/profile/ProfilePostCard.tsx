import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Avatar } from '@/components/ui/Avatar';
import { Hairline } from '@/components/ui/Hairline';
import { Icon, ReactionBadge, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { aspect, formatCount, formatCountLabel } from '@/lib/mock';
import type { Audience, Post } from '@/lib/mock';
import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

const AUDIENCE_ICON: Record<Audience, IconName> = {
  public: 'globe',
  friends: 'friends',
  group: 'users',
  'only-me': 'lock',
};

const AUDIENCE_LABEL: Record<Audience, string> = {
  public: 'Public',
  friends: 'Friends',
  group: 'Group',
  'only-me': 'Only me',
};

export type ProfilePostCardProps = {
  post: Post;
  onToggleLike: () => void;
  onPressComment?: () => void;
  onPressShare?: () => void;
  onPressMenu?: () => void;
};

type ActionProps = {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

function Action({ icon, label, active = false, onPress, accessibilityLabel }: ActionProps) {
  const color = active ? colors.blue : colors.textSecondary;
  return (
    <PressableScale
      onPress={onPress}
      haptic
      scaleTo={0.96}
      pressedOpacity={0.6}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      style={styles.action}
    >
      <Icon name={icon} size={20} color={color} filled={active} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </PressableScale>
  );
}

/**
 * Compact post card for the profile's own-posts list: header, text, full-bleed
 * photo, counts, and the Like / Comment / Share row. Same anatomy as the feed card.
 */
export function ProfilePostCard({ post, onToggleLike, onPressComment, onPressShare, onPressMenu }: ProfilePostCardProps) {
  const hasCounts = post.likeCount > 0 || post.commentCount > 0 || post.shareCount > 0;
  const rightCounts = [
    post.commentCount > 0 ? formatCountLabel(post.commentCount, 'comment') : null,
    post.shareCount > 0 ? formatCountLabel(post.shareCount, 'share') : null,
  ].filter((part): part is string => part !== null);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar source={post.author.avatar} size={layout.avatar} />
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={2}>
            {post.author.name}
            {post.placeName ? (
              <Text style={styles.nameJoin}>
                {' is at '}
                <Text style={styles.namePlace}>{post.placeName}</Text>
              </Text>
            ) : null}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{post.timeLabel} · </Text>
            <Icon
              name={AUDIENCE_ICON[post.audience]}
              size={13}
              color={colors.textSecondary}
              accessibilityLabel={AUDIENCE_LABEL[post.audience]}
            />
          </View>
        </View>
        <IconButton
          name="more"
          size={22}
          color={colors.textSecondary}
          accessibilityLabel="Post options"
          onPress={onPressMenu}
          style={styles.menu}
        />
      </View>

      {post.text ? <Text style={styles.body}>{post.text}</Text> : null}

      {post.image !== undefined ? (
        <Image
          source={post.image}
          style={[styles.media, { aspectRatio: post.imageAspect ?? aspect.post }]}
          contentFit="cover"
          transition={0}
          accessibilityLabel="Photo"
        />
      ) : null}

      {hasCounts ? (
        <View style={styles.counts}>
          <View style={styles.countsLeft}>
            {post.likeCount > 0 ? (
              <>
                <View style={styles.reactions}>
                  {post.reactions.map((kind, index) => (
                    <ReactionBadge
                      key={kind}
                      kind={kind}
                      size={18}
                      ring
                      style={index > 0 ? styles.reactionOverlap : undefined}
                    />
                  ))}
                </View>
                <Text style={styles.count}>{formatCount(post.likeCount)}</Text>
              </>
            ) : null}
          </View>
          {rightCounts.length > 0 ? <Text style={styles.count}>{rightCounts.join('  ')}</Text> : null}
        </View>
      ) : null}

      <Hairline inset={layout.gutter} />

      <View style={styles.actions}>
        <Action
          icon="like"
          label="Like"
          active={post.liked}
          onPress={onToggleLike}
          accessibilityLabel={post.liked ? 'Remove like' : 'Like'}
        />
        <Action icon="comment" label="Comment" onPress={onPressComment} />
        <Action icon="share" label="Share" onPress={onPressShare} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm + 2,
    gap: spacing.sm + 2,
  },
  headerText: { flex: 1 },
  name: { ...typeScale.name },
  nameJoin: { fontWeight: fontWeights.regular },
  namePlace: { fontWeight: fontWeights.semibold },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  meta: { ...typeScale.meta },
  menu: { marginRight: spacing.xs, alignSelf: 'flex-start', marginTop: -spacing.xs },
  body: {
    ...typeScale.body,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.md,
  },
  media: { width: '100%', backgroundColor: colors.surface },
  counts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    height: 40,
  },
  countsLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  reactions: { flexDirection: 'row', alignItems: 'center' },
  reactionOverlap: { marginLeft: -4 },
  count: { ...typeScale.count },
  actions: { flexDirection: 'row', height: layout.actionRowHeight },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm - 2,
  },
  actionLabel: { ...typeScale.action },
});

export default ProfilePostCard;
