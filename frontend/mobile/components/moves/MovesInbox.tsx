import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { useInbox, type MoveNotification } from '@/lib/store/inbox';
import { useMyMoves } from '@/lib/store/moves';
import { colors, spacing } from '@/lib/theme';

/** Moves notifications from the backend, shown above Facebook's own. */
const ICONS: Record<string, IconName> = {
  move_nudge: 'moves-filled',
  joined_your_move: 'user-plus',
  friend_pulling_up: 'navigation',
  muse_flare: 'sparkles',
  muse_free_time: 'clock',
  muse_revive: 'history',
  muse_route: 'route',
  muse_nobody_bit: 'sparkles',
  rate_move: 'star',
  moment_approval: 'images',
};

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export function MovesInbox() {
  const items = useInbox((s) => s.items).slice(0, 8);
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.header}>Moves</Text>
      {items.map((n) => (
        <Row
          key={n.id}
          n={n}
          onPress={() => {
            if (n.data?.move_id) {
              useMyMoves.getState().focus(n.data.move_id);
              router.navigate('/moves');
            }
          }}
        />
      ))}
    </View>
  );
}

function Row({ n, onPress }: { n: MoveNotification; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={[styles.row, !n.read_at && styles.unread]} accessibilityRole="button">
      <View style={styles.icon}>
        <Icon name={ICONS[n.type] ?? 'moves-filled'} size={20} color={colors.white} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {n.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {n.body}
        </Text>
        <Text style={[styles.time, !n.read_at && styles.timeUnread]}>{ago(n.created_at)}</Text>
      </View>
      {!n.read_at ? <View style={styles.dot} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: spacing.sm },
  header: { fontSize: 17, fontWeight: '700', color: colors.text, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  unread: { backgroundColor: colors.unread },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 20, color: colors.text },
  time: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  timeUnread: { color: colors.blue, fontWeight: '600' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.blue },
});
