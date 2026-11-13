import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { TendencyTab } from '@/components/common/TendencyTab';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { ago, untilLabel } from '@/lib/format';
import { toUser } from '@/lib/people';
import { tendencyText } from '@/lib/tendency';
import { colors, hairline, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Move } from '@/lib/types';

export const MOVE_CARD_WIDTH = 264;

export type MoveFeedCardProps = {
  move: Move;
  meId: string | null;
  busy: boolean;
  onOpen: (move: Move) => void;
  onPullUp: (move: Move) => void;
};

/** "There 2 · On the way 1", or null when nobody has joined yet. */
export function presenceLine(move: Move): string | null {
  const there = move.participants.filter((p) => p.status === 'there').length;
  const going = move.participants.filter((p) => p.status === 'going').length;
  const parts = [there ? `There ${there}` : null, going ? `On the way ${going}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

type Action = { title: string; variant: 'primary' | 'tinted' | 'secondary'; icon?: 'check' | 'map-pin'; pullUp: boolean };

function actionFor(move: Move, meId: string | null): Action {
  if (move.creator.id === meId) return { title: 'Your Move', variant: 'secondary', pullUp: false };
  if (move.my_status === 'there') return { title: "You're there", variant: 'secondary', icon: 'map-pin', pullUp: false };
  if (move.my_status === 'going') return { title: 'Going', variant: 'tinted', icon: 'check', pullUp: true };
  return { title: 'Pull up', variant: 'primary', pullUp: true };
}

/** One live Move on Home: who, what, where, who's there, Muse's reason, and Pull up. */
function MoveFeedCardImpl({ move, meId, busy, onOpen, onPullUp }: MoveFeedCardProps) {
  const creator = toUser(move.creator);
  const presence = presenceLine(move);
  const action = actionFor(move, meId);
  const isFlare = move.kind === 'flare' && move.fill_deadline;
  const tendency = tendencyText(move);

  return (
    <PressableScale
      onPress={() => onOpen(move)}
      scaleTo={0.98}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${move.creator.first_name}: ${move.text} at ${move.mark.name}. Open Move`}
    >
      <View style={styles.head}>
        <Avatar source={creator.avatar} size={36} />
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>
            {move.creator.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {ago(move.starts_at)}
            {move.open ? ' · Open Move' : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.text} numberOfLines={2}>
        {move.text}
      </Text>

      <View style={styles.row}>
        <Icon name="map-pin" size={14} color={colors.textSecondary} />
        <Text style={styles.meta} numberOfLines={1}>
          {move.mark.name}
        </Text>
      </View>

      {presence ? (
        <View style={styles.row}>
          <Icon name="users" size={14} color={colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>
            {presence}
          </Text>
        </View>
      ) : null}

      {tendency ? <TendencyTab text={tendency} /> : null}

      {isFlare ? (
        <View style={styles.row}>
          <Icon name="flame" size={14} color={colors.badgeRed} />
          <Text style={[styles.meta, styles.flare]} numberOfLines={1}>
            Flare · {untilLabel(move.fill_deadline as string)}
          </Text>
        </View>
      ) : null}

      <View style={styles.reason}>
        {move.muse_reason ? (
          <>
            <MuseBadge label="Muse ranked" />
            <ReasonLine text={move.muse_reason} />
          </>
        ) : null}
      </View>

      <Button
        title={action.title}
        variant={action.variant}
        icon={action.icon}
        size="sm"
        disabled={busy}
        onPress={() => (action.pullUp ? onPullUp(move) : onOpen(move))}
        accessibilityLabel={action.pullUp ? `${action.title}: ${move.text}` : `${action.title}. Open Move`}
        style={styles.button}
      />
    </PressableScale>
  );
}

export const MoveFeedCard = memo(MoveFeedCardImpl);

const styles = StyleSheet.create({
  card: {
    width: MOVE_CARD_WIDTH,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    ...hairline(),
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  headText: { flex: 1, minWidth: 0 },
  name: { ...typeScale.name, fontSize: 15, lineHeight: 19 },
  meta: { ...typeScale.meta, flexShrink: 1 },
  text: { ...typeScale.body, minHeight: 42 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flare: { color: colors.badgeRed, fontWeight: '600' },
  reason: { gap: spacing.xs, marginTop: spacing.xs, minHeight: 42, justifyContent: 'flex-end' },
  button: { marginTop: spacing.sm },
});

export default MoveFeedCard;
