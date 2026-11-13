import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Post } from '@/lib/mock';
import { useFeedStore } from '@/lib/store/feed';
import { colors, fontWeights, layout, spacing } from '@/lib/theme';

import { LifeEventPost } from './LifeEventPost';
import { LinkPreview } from './LinkPreview';
import { PostActions } from './PostActions';
import { PostCounts } from './PostCounts';
import { PostHeader } from './PostHeader';
import { LINK_IMAGE_ASPECT, PostMedia } from './PostMedia';

export type PostCardProps = {
  post: Post;
  /** "..." in the header. */
  onPressMore?: (post: Post) => void;
  /** X in the header (dismissible posts only). */
  onDismiss?: (post: Post) => void;
  onComment?: (post: Post) => void;
  onShare?: (post: Post) => void;
};

/**
 * Text longer than this is cut (at a word boundary) with an inline "See more".
 * About two lines of 17pt text on a 393pt-wide phone.
 */
const COLLAPSE_AT = 80;

function collapse(text: string): string | null {
  if (text.length <= COLLAPSE_AT + 20) return null;
  const cut = text.slice(0, COLLAPSE_AT);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > COLLAPSE_AT * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '');
}

/** Post copy at 17pt. Long text shows "…See more" inline and expands in place when tapped. */
function PostText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const short = expanded ? null : collapse(text);

  if (short == null) return <Text style={styles.body}>{text}</Text>;

  return (
    <Text style={styles.body}>
      {`${short}... `}
      <Text
        style={styles.seeMore}
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel="See more"
      >
        See more
      </Text>
    </Text>
  );
}

/**
 * One feed post: header, text, full-bleed photo (with a link footer on link
 * posts) or a centered life event, counts, then Like / Comment / Share.
 * Liking goes through the feed store, so the count and the blue state update
 * everywhere the post is shown.
 */
function PostCardBase({ post, onPressMore, onDismiss, onComment, onShare }: PostCardProps) {
  const toggleLike = useFeedStore((s) => s.toggleLike);

  const handleLike = useCallback(() => toggleLike(post.id), [post.id, toggleLike]);
  const handleMore = useCallback(() => onPressMore?.(post), [onPressMore, post]);
  const handleDismiss = useCallback(() => onDismiss?.(post), [onDismiss, post]);
  const handleComment = useCallback(() => onComment?.(post), [onComment, post]);
  const handleShare = useCallback(() => onShare?.(post), [onShare, post]);

  return (
    <View style={styles.card}>
      <PostHeader post={post} onPressMore={handleMore} onDismiss={handleDismiss} />

      {post.text ? <PostText text={post.text} /> : null}

      {post.lifeEvent ? <LifeEventPost event={post.lifeEvent} /> : null}

      {post.image !== undefined ? (
        <PostMedia
          source={post.image}
          aspectRatio={post.link ? LINK_IMAGE_ASPECT : post.imageAspect}
          accessibilityLabel={post.link ? post.link.title : `Photo from ${post.author.name}`}
        />
      ) : null}

      {post.link ? <LinkPreview link={post.link} /> : null}

      <PostCounts
        likeCount={post.likeCount}
        commentCount={post.commentCount}
        shareCount={post.shareCount}
        reactions={post.reactions}
        liked={post.liked}
      />
      <PostActions liked={post.liked} onLike={handleLike} onComment={handleComment} onShare={handleShare} />
    </View>
  );
}

export const PostCard = memo(PostCardBase);

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white },
  body: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: fontWeights.regular,
    letterSpacing: -0.2,
    color: colors.text,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.md,
  },
  seeMore: { color: colors.textSecondary, fontWeight: fontWeights.medium },
});

export default PostCard;
