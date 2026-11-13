import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { Avatar } from '@/components/ui/Avatar';
import { Icon, IconBadge, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { ago } from '@/lib/format';
import { toUser } from '@/lib/people';
import { useSession } from '@/lib/session';
import type { Notification } from '@/lib/types';
import { colors, fontWeights, layout, radius, spacing } from '@/lib/theme';

import { canPullUp, usePullUps } from './pullUp';

const AVATAR = 64;
const BADGE = 28;

const ICONS: Record<string, IconName> = {
  move_nudge: 'moves-filled',
  joined_your_move: 'user-plus',
  friend_pulling_up: 'navigation',
  friend_request: 'user-plus',
  friend_accepted: 'user-plus',
  muse_flare: 'sparkles',
  muse_free_time: 'clock',
  muse_revive: 'history',
  muse_route: 'route',
  muse_nobody_bit: 'sparkles',
  rate_move: 'star',
  moment_approval: 'images',
  proximity_added: 'navigation',
};

const BADGE_COLORS: Record<string, string> = {
  muse: '#7B61FF',
  friend: colors.blue,
  rate_move: '#F7B928',
  moment_approval: '#45BD62',
};

function badgeColor(type: string): string {
  if (type.startsWith('muse_')) return BADGE_COLORS.muse;
  if (type.startsWith('friend_request') || type === 'friend_accepted') return BADGE_COLORS.friend;
  return BADGE_COLORS[type] ?? colors.blue;
}

/** The person a notification is about, when its data names one we know. */
function useActor(n: Notification) {
  const id = n.data?.joiner_id ?? n.data?.user_id ?? n.data?.creator_id;
  return useSession((s) => (id ? (s.users.find((u) => u.id === id) ?? null) : null));
}

export type MoveNotificationRowProps = {
  notification: Notification;
  onPress: (n: Notification) => void;
  onPressMore?: (n: Notification) => void;
};

function PullUpPill({ moveId }: { moveId: string }) {
  const state = usePullUps((s) => s.byMove[moveId]);
  const pullUp = usePullUps((s) => s.pullUp);
  const done = state != null;
  return (
    <PressableScale
      onPress={() => void pullUp(moveId)}
      disabled={done}
      haptic
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={done ? 'Pulling up' : 'Pull up'}
      accessibilityState={{ disabled: done }}
      style={[styles.pill, done && styles.pillDone]}
    >
      <Icon name={done ? 'check' : 'navigation'} size={16} color={done ? colors.text : colors.white} />
      <Text style={[styles.pillText, done && styles.pillTextDone]}>{done ? 'Pulling up' : 'Pull up'}</Text>
    </PressableScale>
  );
}

function MoveNotificationRowBase({ notification: n, onPress, onPressMore }: MoveNotificationRowProps) {
  const unread = !n.read_at;
  const actor = useActor(n);
  const isMuse = n.type.startsWith('muse_');
  const reason = n.data?.reason;
  const badge = <IconBadge name={ICONS[n.type] ?? 'bell'} color={badgeColor(n.type)} size={BADGE} ring />;

  return (
    <View style={{ backgroundColor: unread ? colors.unread : colors.white }}>
      <PressableScale
        onPress={() => onPress(n)}
        scaleTo={1}
        pressedOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'Unread. ' : ''}${n.title}. ${n.body}. ${ago(n.created_at)} ago`}
        style={styles.row}
      >
        {actor ? (
          <Avatar source={toUser(actor).avatar} size={AVATAR} badge={badge} />
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: badgeColor(n.type) }]}>
            <Icon name={ICONS[n.type] ?? 'bell'} size={28} color={colors.white} />
          </View>
        )}

        <View style={styles.body}>
          <Text style={styles.text} numberOfLines={4}>
            <Text style={styles.bold}>{n.title}</Text>
            {n.body ? <Text>{` ${n.body}`}</Text> : null}
            <Text style={[styles.time, unread && styles.timeUnread]}>{` ${ago(n.created_at)}`}</Text>
          </Text>
          {reason ? <ReasonLine text={reason} style={styles.meta} /> : null}
          {isMuse ? <MuseBadge style={styles.meta} /> : null}
          {canPullUp(n) ? <PullUpPill moveId={n.data.move_id} /> : null}
        </View>

        {onPressMore ? (
          <IconButton
            name="more"
            size={24}
            color={colors.text}
            accessibilityLabel="Manage this notification"
            onPress={() => onPressMore(n)}
            style={styles.more}
          />
        ) : null}
      </PressableScale>
    </View>
  );
}

/** One Moves notification: avatar or type icon, title + body with time, reason line, Muse badge, Pull up pill. */
export const MoveNotificationRow = memo(MoveNotificationRowBase);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: layout.gutter + spacing.xxs,
    paddingRight: spacing.xxs,
    paddingVertical: 10,
    minHeight: AVATAR + 20,
  },
  iconCircle: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minHeight: AVATAR, justifyContent: 'center', marginLeft: spacing.lg, gap: spacing.xs },
  text: { fontSize: 17, lineHeight: 22, color: colors.text },
  bold: { fontWeight: fontWeights.semibold },
  time: { color: colors.textSecondary },
  timeUnread: { color: colors.blue, fontWeight: fontWeights.semibold },
  meta: { alignSelf: 'flex-start' },
  more: { marginTop: -spacing.xs },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    marginTop: spacing.xxs,
  },
  pillDone: { backgroundColor: colors.buttonSecondary },
  pillText: { fontSize: 15, fontWeight: fontWeights.semibold, color: colors.white },
  pillTextDone: { color: colors.text },
});

export default MoveNotificationRow;
