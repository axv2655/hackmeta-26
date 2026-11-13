import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MoveNotificationRow } from '@/components/fb/notifications/MoveNotificationRow';
import { useOpenTarget } from '@/lib/nav';
import { useInbox } from '@/lib/store/inbox';
import type { Notification } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

export type MovesInboxProps = {
  /** Show at most this many (newest first). Default: all. */
  limit?: number;
  title?: string;
};

/**
 * A compact list of Moves notifications with the same tap routing and inline
 * Pull up as the Notifications tab. Renders nothing when there are none (the
 * Notifications tab owns the loading, error and empty states).
 */
export function MovesInbox({ limit, title = 'Moves' }: MovesInboxProps) {
  const all = useInbox((s) => s.items);
  const openTarget = useOpenTarget();
  const open = useCallback(
    (n: Notification) => {
      void useInbox.getState().markRead([n.id]);
      openTarget(n.data, n.type);
    },
    [openTarget],
  );
  const items = limit == null ? all : all.slice(0, limit);
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.header} accessibilityRole="header">
        {title}
      </Text>
      {items.map((n) => (
        <MoveNotificationRow key={n.id} notification={n} onPress={open} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: spacing.sm },
  header: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
