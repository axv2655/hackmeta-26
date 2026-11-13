import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MetaShortcutIcon } from '@/components/ui/MetaShortcutIcon';
import { PressableScale } from '@/components/ui/PressableScale';
import { MomentImage } from '@/components/move/MomentImage';
import { useMoments } from '@/components/move/useMoments';
import { ago, serverNow } from '@/lib/format';
import { toUser } from '@/lib/people';
import { useMe } from '@/lib/session';
import type { Memory, Moment } from '@/lib/types';
import { colors, fontWeights, hairline, layout, radius, spacing } from '@/lib/theme';

const DAY = 86_400_000;
const GRID_MAX = 4;

/** "Today", "Yesterday", or "Sat, Nov 7" (on the demo clock). */
function dayLabel(iso: string): string {
  const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(serverNow()) - startOf(Date.parse(iso))) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Maya", "Maya and Dev", "Maya, Dev and 2 others". */
function withLine(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

/** Facebook's photo grid: 1 full, 2 side by side, 3 = one big + two, 4+ = 2x2 with "+N" on the last. */
function PhotoGrid({ moments, onPress }: { moments: Moment[]; onPress: () => void }) {
  const shown = moments.slice(0, GRID_MAX);
  const extra = moments.length - shown.length;
  const tile = (m: Moment, i: number, style: object) => (
    <Pressable key={m.id} onPress={onPress} style={style} accessibilityRole="imagebutton"
      accessibilityLabel={`Photo by ${m.author.first_name}${i === shown.length - 1 && extra ? `, and ${extra} more` : ''}`}>
      <MomentImage moment={m} style={StyleSheet.absoluteFill} />
      {i === shown.length - 1 && extra > 0 ? (
        <View style={styles.more}><Text style={styles.moreText}>+{extra}</Text></View>
      ) : null}
    </Pressable>
  );
  if (shown.length === 1) return <View style={styles.grid}>{tile(shown[0], 0, styles.one)}</View>;
  if (shown.length === 2) return <View style={[styles.grid, styles.row]}>{shown.map((m, i) => tile(m, i, styles.half))}</View>;
  if (shown.length === 3) {
    return (
      <View style={styles.grid}>
        {tile(shown[0], 0, styles.wide)}
        <View style={styles.row}>{shown.slice(1).map((m, i) => tile(m, i + 1, styles.half))}</View>
      </View>
    );
  }
  return (
    <View style={styles.grid}>
      <View style={styles.row}>{shown.slice(0, 2).map((m, i) => tile(m, i, styles.half))}</View>
      <View style={styles.row}>{shown.slice(2).map((m, i) => tile(m, i + 2, styles.half))}</View>
    </View>
  );
}

/** One Memory shown like a Facebook memory post; its Moments arrive live (`useMoments` listens for moment.added). */
export function MemoryPost({ memory }: { memory: Memory }) {
  const router = useRouter();
  const me = useMe();
  const { items } = useMoments(memory.move_id);
  const names = memory.people.map((u) => u.first_name);
  const openMoments = () => router.push(`/move/${encodeURIComponent(memory.move_id)}/moments`);

  return (
    <View style={styles.card}>
      <View style={styles.banner}>
        <MetaShortcutIcon name="memories" size={20} />
        <Text style={styles.bannerText}>{dayLabel(memory.at)}</Text>
        <View style={styles.only}>
          <Icon name="lock" size={12} color={colors.textSecondary} />
          <Text style={styles.meta}>Only you</Text>
        </View>
      </View>

      <View style={styles.header}>
        {me ? <Avatar source={toUser(me).avatar} size={42} /> : null}
        <View style={styles.titles}>
          <Text style={styles.headline}>
            <Text style={styles.bold}>{me?.name ?? 'You'}</Text>
            {' was at '}
            <Text style={styles.bold}>{memory.mark_name}</Text>
            {names.length ? <>{' with '}<Text style={styles.bold}>{withLine(names)}</Text></> : null}
          </Text>
          <Text style={styles.meta}>{ago(memory.at)} ago</Text>
        </View>
      </View>

      {memory.text ? <Text style={styles.text}>{memory.text}</Text> : null}
      {memory.people.length ? (
        <View style={styles.faces}>
          {memory.people.slice(0, 5).map((u) => <Avatar key={u.id} source={toUser(u).avatar} size={24} />)}
        </View>
      ) : null}

      {items.length ? <PhotoGrid moments={items} onPress={openMoments} /> : null}

      <View style={styles.actions}>
        <PressableScale onPress={openMoments} haptic accessibilityRole="button" style={styles.action}>
          <Icon name="images" size={20} color={colors.textSecondary} />
          <Text style={styles.actionText}>{items.length ? `Moments · ${items.length}` : 'Moments'}</Text>
        </PressableScale>
        <PressableScale onPress={() => router.push(`/mark/${encodeURIComponent(memory.mark_id)}`)} haptic
          accessibilityRole="button" style={styles.action}>
          <Icon name="map-pin" size={20} color={colors.textSecondary} />
          <Text style={styles.actionText}>View place</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', paddingTop: spacing.md },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  bannerText: { fontSize: 15, fontWeight: fontWeights.bold, color: colors.text },
  only: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  header: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingTop: spacing.sm, ...hairline('Top') },
  titles: { flex: 1, gap: 2 },
  headline: { fontSize: 15, lineHeight: 20, color: colors.text },
  bold: { fontWeight: fontWeights.semibold },
  meta: { fontSize: 13, color: colors.textSecondary },
  text: { fontSize: 15, lineHeight: 20, color: colors.text, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  faces: { flexDirection: 'row', gap: 4, paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
  grid: { marginTop: spacing.md, gap: 2 },
  row: { flexDirection: 'row', gap: 2 },
  one: { width: '100%', aspectRatio: 1 },
  wide: { width: '100%', aspectRatio: 2 },
  half: { flex: 1, aspectRatio: 1 },
  more: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  moreText: { color: colors.white, fontSize: 28, fontWeight: fontWeights.bold },
  actions: { flexDirection: 'row', ...hairline('Top'), marginTop: spacing.md },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  actionText: { fontSize: 15, fontWeight: fontWeights.semibold, color: colors.textSecondary },
});

export default MemoryPost;
