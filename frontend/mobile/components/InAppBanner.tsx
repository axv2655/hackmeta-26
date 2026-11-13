import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/ui/Glass';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { tap } from '@/lib/haptics';
import { useOpenTarget } from '@/lib/nav';
import { useInbox, type MoveNotification } from '@/lib/store/inbox';
import { colors, radius, spacing } from '@/lib/theme';
import { toast } from '@/lib/toast';

const SHOW_MS = 4500;
/** Longer when there is a button to reach for. */
const SHOW_WITH_ACTION_MS = 7000;

/** One glyph per notification type (same set as the Notifications tab). */
export const NOTIFICATION_ICONS: Record<string, IconName> = {
  move_nudge: 'moves-filled',
  joined_your_move: 'user-plus',
  friend_pulling_up: 'navigation',
  proximity_added: 'users',
  muse_flare: 'sparkles',
  muse_free_time: 'clock',
  muse_revive: 'history',
  muse_nobody_bit: 'sparkles',
  rate_move: 'star',
  moment_approval: 'images',
  friend_request: 'user-plus',
  friend_accepted: 'user-check',
};

type Pill = { label: string; run: (moveId: string) => Promise<unknown>; done: string };

const PULL_UP: Pill = { label: 'Pull up', run: (id) => endpoints.moves.join(id), done: "You're pulling up" };
const UNDO: Pill = { label: 'Undo', run: (id) => endpoints.moves.leave(id, true), done: 'Removed you from the Move' };

/** The inline action a banner offers, if any. */
function pillFor(n: MoveNotification): Pill | null {
  if (!n.data?.move_id) return null;
  if (n.type === 'move_nudge' || n.type === 'friend_pulling_up') return PULL_UP;
  if (n.type === 'proximity_added' || n.data.undo === 'leave') return UNDO;
  return null;
}

/**
 * Top-of-screen banner for a notification that just arrived over the socket
 * (ARCHITECTURE.md 9.1). Tapping it opens where the notification points
 * (`routeFor`) and marks it read. Move nudges carry an inline "Pull up";
 * a proximity auto-join carries "Undo".
 */
export function InAppBanner() {
  const insets = useSafeAreaInsets();
  const open = useOpenTarget();
  const banner = useInbox((s) => s.banner);
  const dismiss = useInbox((s) => s.dismissBanner);
  const [busy, setBusy] = useState(false);
  const pill = banner ? pillFor(banner) : null;

  useEffect(() => {
    if (!banner) return;
    tap();
    setBusy(false);
    const timer = setTimeout(dismiss, pill ? SHOW_WITH_ACTION_MS : SHOW_MS);
    return () => clearTimeout(timer);
  }, [banner, dismiss, pill]);

  if (!banner) return null;

  const onOpen = () => {
    dismiss();
    void useInbox.getState().markRead([banner.id]);
    open(banner.data, banner.type);
  };

  const onPill = async () => {
    const moveId = banner.data?.move_id;
    if (!pill || !moveId || busy) return;
    setBusy(true);
    try {
      await pill.run(moveId);
      appEvents.emit('moves.changed', { move_id: moveId });
      void useInbox.getState().markRead([banner.id]);
      dismiss();
      toast(pill.done);
    } catch (e) {
      setBusy(false);
      toast(errorMessage(e));
    }
  };

  return (
    <Animated.View
      key={banner.id}
      entering={FadeInUp.springify().damping(18)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.wrap, { top: insets.top + 6 }]}
      pointerEvents="box-none"
    >
      <GlassSurface radius={22} style={styles.card}>
        <PressableScale
          scaleTo={0.97}
          accessibilityRole="button"
          accessibilityLabel={`${banner.title}. ${banner.body}`}
          onPress={onOpen}
          style={styles.main}
        >
          <View style={styles.icon}>
            <Icon name={NOTIFICATION_ICONS[banner.type] ?? 'moves-filled'} size={18} color={colors.white} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {banner.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {banner.body}
            </Text>
          </View>
        </PressableScale>
        {pill ? (
          <PressableScale
            onPress={() => void onPill()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={pill.label}
            style={[styles.pill, busy && styles.pillBusy]}
          >
            <Text style={styles.pillText}>{busy ? '...' : pill.label}</Text>
          </PressableScale>
        ) : null}
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, zIndex: 1000 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 14, paddingRight: 10, paddingVertical: 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  pill: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBusy: { opacity: 0.6 },
  pillText: { fontSize: 14, fontWeight: '700', color: colors.white },
});
