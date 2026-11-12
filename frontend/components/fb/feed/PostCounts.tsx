import { StyleSheet, Text, View } from 'react-native';

import { ReactionBadge } from '@/components/ui/Icon';
import { formatCount, formatCountLabel, type ReactionKind } from '@/lib/mock';
import { colors, layout, spacing, type as typeScale } from '@/lib/theme';

export type PostCountsProps = {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  /** Reaction badges left of the like count, in order. */
  reactions: readonly ReactionKind[];
  /** When the current user has liked the post, a thumb badge is always among the badges. */
  liked?: boolean;
};

const BADGE_SIZE = 19;
const BADGE_RING = 2;

/** "[like][love] 9.7k ............ 1.1k comments  234 shares". Renders nothing when every count is 0. */
export function PostCounts({ likeCount, commentCount, shareCount, reactions, liked = false }: PostCountsProps) {
  if (likeCount <= 0 && commentCount <= 0 && shareCount <= 0) return null;

  const kinds: readonly ReactionKind[] =
    reactions.length === 0 || (liked && !reactions.includes('like')) ? ['like', ...reactions] : reactions;

  return (
    <View style={styles.row}>
      {likeCount > 0 ? (
        <View
          style={styles.left}
          accessible
          accessibilityLabel={formatCountLabel(likeCount, 'reaction')}
        >
          <View style={styles.badges}>
            {kinds.map((kind, i) => (
              <ReactionBadge
                key={kind}
                kind={kind}
                size={BADGE_SIZE}
                ring
                style={[{ zIndex: kinds.length - i }, i > 0 && styles.badgeOverlap]}
              />
            ))}
          </View>
          <Text style={styles.count}>{formatCount(likeCount)}</Text>
        </View>
      ) : (
        <View />
      )}
      <View style={styles.right}>
        {commentCount > 0 ? <Text style={styles.count}>{formatCountLabel(commentCount, 'comment')}</Text> : null}
        {shareCount > 0 ? <Text style={styles.count}>{formatCountLabel(shareCount, 'share')}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.white,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // Pull the white ring into the gutter so the colored disc itself sits on the 12pt line.
  badges: { flexDirection: 'row', alignItems: 'center', marginLeft: -BADGE_RING },
  badgeOverlap: { marginLeft: -6 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  count: { ...typeScale.count, fontSize: 15, lineHeight: 20 },
});

export default PostCounts;
