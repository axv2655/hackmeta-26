import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { Icon } from '@/components/ui/Icon';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { categoryMeta } from '@/lib/categories';
import { ago, untilLabel } from '@/lib/format';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Move } from '@/lib/types';

/** Re-renders every `ms` so time labels stay current. */
function useTick(ms: number, on: boolean): void {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms, on]);
}

function since(iso: string): string {
  const a = ago(iso);
  return a === 'now' ? 'just now' : `${a} ago`;
}

function statusLine(move: Move): string {
  if (move.status === 'live') return `Live · started ${since(move.starts_at)}`;
  const when = move.ends_at ? ` ${since(move.ends_at)}` : '';
  return move.status === 'cancelled' ? `This Move was called off${when}` : `This Move ended${when}`;
}

function Pill({ icon, label, color }: { icon: Parameters<typeof Icon>[0]['name']; label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1A` }]}>
      <Icon name={icon} size={13} color={color} />
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** Who posted it, what it is, whether it's live, and why Muse showed it. */
export function MoveHeader({ move }: { move: Move }) {
  const router = useRouter();
  const live = move.status === 'live';
  const fillsAt = live && move.kind === 'flare' ? move.fill_deadline : null;
  useTick(30_000, live);
  const cat = categoryMeta(move.category);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.creator}
        onPress={() => router.push(`/user/${move.creator.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${move.creator.name}'s profile`}
      >
        <PersonAvatar user={move.creator} size={44} />
        <View style={styles.creatorText}>
          <View style={styles.nameRow}>
            <Text style={typeScale.name} numberOfLines={1}>
              {move.creator.name}
            </Text>
            {move.creator.fb_verified ? <VerifiedBadge /> : null}
          </View>
          <Text style={[typeScale.meta, live ? styles.live : null]}>{statusLine(move)}</Text>
        </View>
      </Pressable>

      <Text style={styles.text}>{move.text}</Text>

      <View style={styles.pills}>
        <Pill icon={cat.icon} label={cat.label} color={cat.color} />
        {move.kind === 'flare' ? <Pill icon="flame" label="Flare" color={colors.love} /> : null}
        {move.open ? <Pill icon="globe" label="Open Move · nearby people can find it" color={colors.blue} /> : null}
      </View>

      {fillsAt ? (
        <View style={styles.fill}>
          <Icon name="clock" size={16} color={colors.love} />
          <Text style={styles.fillText}>{untilLabel(fillsAt)}</Text>
        </View>
      ) : null}

      {move.muse_reason ? (
        <View style={styles.reason}>
          <MuseBadge label="Why you're seeing this" />
          <ReasonLine text={move.muse_reason} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  creator: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  creatorText: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  live: { color: colors.online, fontWeight: '600' },
  text: { ...typeScale.eventTitle },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pillText: { ...typeScale.label, fontSize: 12 },
  fill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FDECEF',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fillText: { ...typeScale.name, color: colors.love },
  reason: { gap: spacing.xs },
});
