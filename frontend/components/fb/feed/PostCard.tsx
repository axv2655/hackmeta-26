import { memo, useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Hairline } from '@/components/ui/Hairline';
import type { Post } from '@/lib/mock';
import { useFeedStore } from '@/lib/store/feed';
import { colors, layout, type as typeScale } from '@/lib/theme';

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

      {post.text ? <Text style={styles.body}>{post.text}</Text> : null}

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
      <Hairline inset={layout.gutter} />
      <PostActions liked={post.liked} onLike={handleLike} onComment={handleComment} onShare={handleShare} />
    </View>
  );
}

export const PostCard = memo(PostCardBase);

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white },
  body: {
    ...typeScale.body,
    paddingHorizontal: layout.gutter,
    paddingBottom: 10,
  },
});

export default PostCard;
