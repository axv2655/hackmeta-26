import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { toUser } from '@/lib/people';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { MarkDetail, MarkMoment } from '@/lib/types';

import { ghostLine, latestGhost as latestOf, mediaSource } from './media';

const THUMB = 104;

function MomentThumb({ moment }: { moment: MarkMoment }) {
  const router = useRouter();
  const source = mediaSource(moment.media_url);
  return (
    <PressableScale
      onPress={() => router.push(`/move/${encodeURIComponent(moment.move_id)}/moments`)}
      scaleTo={0.96}
      accessibilityLabel={`Moment by ${moment.author.first_name}${moment.caption ? `: ${moment.caption}` : ''}`}
      style={styles.thumb}
    >
      {source ? <Image source={source} style={styles.thumbImage} contentFit="cover" transition={150} /> : null}
      {moment.media_type === 'clip' ? (
        <View style={styles.clip}>
          <Icon name="play" size={14} color={colors.white} />
        </View>
      ) : null}
    </PressableScale>
  );
}

/** Who ranked it, how many Moves, who was here (ghosts) and recent Moments. */
export function MarkSocial({ mark }: { mark: MarkDetail }) {
  const router = useRouter();
  const ghosts = ghostLine(mark.ghosts);
  const latestGhost = latestOf(mark.ghosts);
  return (
    <View style={styles.wrap}>
      {mark.top_ranker ? (
        <View style={styles.row}>
          <Avatar source={toUser(mark.top_ranker.user).avatar} size={28} accessibilityLabel={mark.top_ranker.user.name} />
          <Text style={styles.text}>
            Ranked highest by {mark.top_ranker.user.first_name} ({mark.top_ranker.score.toFixed(1)})
          </Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Icon name="moves" size={22} color={colors.textSecondary} />
        <Text style={styles.text}>
          {mark.moves_count} {mark.moves_count === 1 ? 'Move' : 'Moves'} here
        </Text>
      </View>
      {ghosts && latestGhost ? (
        <PressableScale
          onPress={() => router.push(`/move/${encodeURIComponent(latestGhost.move_id)}/moments`)}
          scaleTo={0.98}
          accessibilityLabel={`${ghosts}. See Moments`}
          style={styles.row}
        >
          <Icon name="history" size={22} color={colors.textSecondary} />
          <Text style={[styles.text, styles.link]}>{ghosts}</Text>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} />
        </PressableScale>
      ) : null}
      {mark.moments.length > 0 ? (
        <View style={styles.moments}>
          <Text style={styles.heading}>Recent Moments</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {mark.moments.map((m) => (
              <MomentThumb key={m.id} moment={m} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { ...typeScale.body, flexShrink: 1 },
  link: { color: colors.text, fontWeight: '600' },
  heading: { ...typeScale.sectionTitle },
  moments: { gap: spacing.sm },
  strip: { gap: spacing.sm },
  thumb: { width: THUMB, height: THUMB * 1.3, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  thumbImage: { flex: 1 },
  clip: { position: 'absolute', top: spacing.xs, right: spacing.xs, backgroundColor: colors.scrim, borderRadius: radius.pill, padding: 4 },
});

export default MarkSocial;
