import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { categoryMeta } from '@/lib/categories';
import { ago } from '@/lib/format';
import { mutualLabel } from '@/lib/friends';
import type { Profile, ProfileMove } from '@/lib/types';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

import { PersonAvatar } from './PersonAvatar';
import { SectionEmpty, SectionHeader } from './Section';

/** "{n} mutual friends" with up to 6 avatars; each opens that profile. */
export function MutualFriends({ profile }: { profile: Profile }) {
  const router = useRouter();
  const label = mutualLabel(profile.mutual_count);
  if (!label) return null;
  return (
    <View>
      <SectionHeader title="Mutual friends" />
      <Text style={styles.sub}>{label}</Text>
      <View style={styles.avatars}>
        {profile.mutual.map((u) => (
          <PressableScale
            key={u.id}
            style={styles.mutual}
            onPress={() => router.push(`/user/${encodeURIComponent(u.id)}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${u.name}'s profile`}
          >
            <PersonAvatar user={u} size={56} />
            <Text style={styles.mutualName} numberOfLines={1}>
              {u.first_name}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const STATUS_LINE: Record<string, string> = { going: "You're on the way", there: "You're there", left: 'You left' };

function MoveRow({ move }: { move: ProfileMove }) {
  const router = useRouter();
  const meta = categoryMeta(move.category);
  const mine = move.my_status ? STATUS_LINE[move.my_status] : null;
  return (
    <PressableScale
      style={styles.moveRow}
      scaleTo={1}
      pressedOpacity={0.6}
      onPress={() => router.push(`/move/${encodeURIComponent(move.id)}`)}
      accessibilityRole="button"
      accessibilityLabel={`${move.text} at ${move.mark.name}. Open Move`}
    >
      <View style={[styles.moveIcon, { backgroundColor: meta.color }]}>
        <Icon name={meta.icon} size={20} color={colors.white} />
      </View>
      <View style={styles.moveText}>
        <Text style={styles.moveTitle} numberOfLines={2}>
          {move.text}
        </Text>
        <Text style={styles.moveMeta} numberOfLines={1}>
          {`${move.mark.name} · ${ago(move.starts_at)}`}
          {mine ? ` · ${mine}` : ''}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textSecondary} />
    </PressableScale>
  );
}

/** Live Moves the viewer can see, each opening the Move. */
export function ProfileMoves({ profile }: { profile: Profile }) {
  return (
    <View>
      <SectionHeader title="Live Moves" count={profile.moves.length || undefined} />
      {profile.moves.map((m) => (
        <MoveRow key={m.id} move={m} />
      ))}
      {profile.moves.length === 0 ? (
        <SectionEmpty text={`No live Moves from ${profile.user.first_name} that you can see.`} />
      ) : null}
    </View>
  );
}

/** The quiet privacy action at the bottom of someone else's profile. */
export function HideMovesRow({ firstName, onPress }: { firstName: string; onPress: () => void }) {
  return (
    <PressableScale style={styles.hideRow} scaleTo={1} pressedOpacity={0.6} onPress={onPress} accessibilityRole="button">
      <Icon name="eye-off" size={20} color={colors.text} />
      <View style={styles.moveText}>
        <Text style={styles.hideTitle}>{`Hide my Moves from ${firstName}`}</Text>
        <Text style={styles.moveMeta}>{`${firstName} won't see your Moves and you won't be friends.`}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  sub: { ...typeScale.rowSub, paddingHorizontal: layout.gutter + spacing.xs, marginTop: -spacing.xs },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: layout.gutter + spacing.xs, paddingTop: spacing.md },
  mutual: { width: 64, alignItems: 'center', gap: spacing.xs },
  mutualName: { ...typeScale.meta, color: colors.text, maxWidth: 64 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  moveIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  moveText: { flex: 1, minWidth: 0 },
  moveTitle: { ...typeScale.name },
  moveMeta: { ...typeScale.meta, marginTop: 2 },
  hideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  hideTitle: { ...typeScale.name },
});
