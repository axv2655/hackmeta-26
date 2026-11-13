import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View, type SectionListData } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { OfflineBar } from '@/components/common/OfflineBar';
import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { NotificationActionSheet, type SheetOption } from '@/components/fb/notifications/NotificationActionSheet';
import { MoveNotificationRow } from '@/components/fb/notifications/MoveNotificationRow';
import { NotificationSectionHeader } from '@/components/fb/notifications/NotificationSectionHeader';
import { NotificationsEmptyState } from '@/components/fb/notifications/NotificationsEmptyState';
import { SampleNotifications } from '@/components/fb/notifications/SampleNotifications';
import { FriendRequestsInbox } from '@/components/friends/FriendRequestsInbox';
import { DEMO } from '@/lib/demo';
import { useFriends } from '@/lib/friends';
import { useOpenTarget } from '@/lib/nav';
import { setInboxFocused, useInbox } from '@/lib/store/inbox';
import type { Notification } from '@/lib/types';
import { colors, spacing } from '@/lib/theme';

type Section = { key: 'new' | 'earlier'; title: string; data: Notification[] };
type Sheet = { kind: 'header' } | { kind: 'row'; n: Notification };

const HEADER_OPTIONS: SheetOption[] = [
  { key: 'read-all', icon: 'check', label: 'Mark all as read' },
  { key: 'settings', icon: 'settings', label: 'Notification settings' },
];

function rowOptions(n: Notification): SheetOption[] {
  const read: SheetOption[] = n.read_at ? [] : [{ key: 'read', icon: 'check', label: 'Mark as read' }];
  return [...read, { key: 'settings', icon: 'bell-off', label: 'Turn off notifications like this' }];
}

export default function NotificationsScreen() {
  const router = useRouter();
  const openTarget = useOpenTarget();
  const tabBarHeight = useTabBarHeight();
  const items = useInbox((s) => s.items);
  const status = useInbox((s) => s.status);
  const error = useInbox((s) => s.error);
  const incomingCount = useFriends((s) => s.incoming.length);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);

  // While the tab is open the badge stays at 0; everything listed counts as seen.
  useFocusEffect(
    useCallback(() => {
      setInboxFocused(true);
      void useInbox.getState().load();
      return () => setInboxFocused(false);
    }, []),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([useInbox.getState().load(), useFriends.getState().load()]);
    setRefreshing(false);
  }, []);

  const openRow = useCallback(
    (n: Notification) => {
      void useInbox.getState().markRead([n.id]);
      openTarget(n.data, n.type);
    },
    [openTarget],
  );

  const openSheet = useCallback((next: Sheet) => {
    setSheet(next);
    setSheetVisible(true);
  }, []);
  const openRowSheet = useCallback((n: Notification) => openSheet({ kind: 'row', n }), [openSheet]);

  const onSelect = (key: string) => {
    setSheetVisible(false);
    if (key === 'read-all') void useInbox.getState().markAllRead();
    else if (key === 'read' && sheet?.kind === 'row') void useInbox.getState().markRead([sheet.n.id]);
    else if (key === 'settings') router.push('/settings/notifications');
  };

  const sections = useMemo<Section[]>(() => {
    const fresh = items.filter((n) => !n.read_at);
    const earlier = items.filter((n) => n.read_at);
    return [
      ...(fresh.length ? [{ key: 'new' as const, title: 'New', data: fresh }] : []),
      ...(earlier.length ? [{ key: 'earlier' as const, title: 'Earlier', data: earlier }] : []),
    ];
  }, [items]);

  const headerActions = useMemo<HeaderAction[]>(
    () => [
      {
        icon: 'more',
        variant: 'outline',
        accessibilityLabel: 'More notification options',
        onPress: () => openSheet({ kind: 'header' }),
      },
    ],
    [openSheet],
  );

  const firstLoad = items.length === 0 && (status === 'idle' || status === 'loading');
  const failed = items.length === 0 && status === 'error';

  const empty = firstLoad ? (
    <LoadingState label="Loading notifications" />
  ) : failed ? (
    <ErrorState message={error ?? "Couldn't load notifications"} onRetry={() => void useInbox.getState().load()} />
  ) : incomingCount > 0 || DEMO ? null : (
    <NotificationsEmptyState
      icon="bell"
      title="No notifications yet"
      message="When friends make a Move or pull up to yours, you'll see it here."
    />
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="Notifications" actions={headerActions} />
      <OfflineBar />

      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <MoveNotificationRow notification={item} onPress={openRow} onPressMore={openRowSheet} />
        )}
        renderSectionHeader={({ section }: { section: SectionListData<Notification, Section> }) => (
          <NotificationSectionHeader title={section.title} />
        )}
        ListHeaderComponent={
          <>
            {status === 'error' && items.length > 0 ? (
              <Pressable
                onPress={() => void useInbox.getState().load()}
                accessibilityRole="button"
                style={styles.stale}
              >
                <Text style={styles.staleText}>Couldn't refresh. Tap to try again.</Text>
              </Pressable>
            ) : null}
            <FriendRequestsInbox />
          </>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={DEMO ? <SampleNotifications /> : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
      />

      <NotificationActionSheet
        visible={sheetVisible}
        options={sheet?.kind === 'row' ? rowOptions(sheet.n) : HEADER_OPTIONS}
        onSelect={onSelect}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  stale: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  staleText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
});
