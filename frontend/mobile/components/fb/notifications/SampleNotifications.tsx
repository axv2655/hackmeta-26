import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { IconBadge } from '@/components/ui/Icon';
import { notifications as mockNotifications } from '@/lib/mock';
import { colors, fontWeights, layout, radius, spacing } from '@/lib/theme';

import { NotificationActionSheet, SheetSummary, type SheetOption } from './NotificationActionSheet';
import { NotificationRow } from './NotificationRow';
import { NotificationSectionHeader } from './NotificationSectionHeader';

/** Facebook's own notifications, bundled sample data. Rendered only in a demo build (EXPO_PUBLIC_DEMO=1). */
const SAMPLES = mockNotifications.filter((n) => !(n.type === 'friend-request' && n.hasActions));

function toggled(set: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

export function SampleNotifications() {
  const router = useRouter();
  const [unread, setUnread] = useState<Set<string>>(() => new Set(SAMPLES.filter((n) => n.unread).map((n) => n.id)));
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [sheet, setSheet] = useState<{ id: string | null; visible: boolean }>({ id: null, visible: false });

  const rows = useMemo(() => SAMPLES.filter((n) => !removed.has(n.id)), [removed]);
  const markRead = useCallback((id: string) => setUnread((prev) => toggled(prev, id, false)), []);
  const openSheet = useCallback((id: string) => setSheet({ id, visible: true }), []);
  const closeSheet = useCallback(() => setSheet((prev) => ({ ...prev, visible: false })), []);

  const current = sheet.id ? (SAMPLES.find((n) => n.id === sheet.id) ?? null) : null;
  const options: SheetOption[] = [
    { key: 'toggle-read', icon: 'check', label: current && unread.has(current.id) ? 'Mark as read' : 'Mark as unread' },
    { key: 'remove', icon: 'x-circle', label: 'Remove this notification' },
    { key: 'settings', icon: 'bell-off', label: 'Notification settings' },
  ];

  const onSelect = (key: string) => {
    closeSheet();
    if (!current) return;
    if (key === 'toggle-read') setUnread((prev) => toggled(prev, current.id, !prev.has(current.id)));
    else if (key === 'remove') setRemoved((prev) => toggled(prev, current.id, true));
    else router.push('/settings/notifications');
  };

  if (rows.length === 0) return null;
  return (
    <View>
      <View style={styles.headerRow}>
        <NotificationSectionHeader title="From Facebook" />
        <Text style={styles.pill}>Sample</Text>
      </View>
      {rows.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          unread={unread.has(n.id)}
          onPress={markRead}
          onPressMore={openSheet}
        />
      ))}
      <NotificationActionSheet
        visible={sheet.visible}
        header={
          current ? (
            <SheetSummary
              picture={
                <Avatar
                  source={current.avatar}
                  size={64}
                  badge={<IconBadge name={current.badgeIcon} color={current.badgeColor} size={28} ring />}
                />
              }
              text={current.segments.map((s) => s.text).join('')}
            />
          ) : undefined
        }
        options={options}
        onSelect={onSelect}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { position: 'relative' },
  pill: {
    position: 'absolute',
    right: layout.gutter,
    bottom: spacing.xs,
    fontSize: 12,
    fontWeight: fontWeights.semibold,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
