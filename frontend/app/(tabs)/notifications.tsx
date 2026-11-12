import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View, type SectionListData, type SectionListRenderItemInfo } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { FilterChips } from '@/components/fb/notifications/FilterChips';
import {
  NotificationActionSheet,
  type NotificationSheetAction,
} from '@/components/fb/notifications/NotificationActionSheet';
import { NotificationRow, segmentsFor } from '@/components/fb/notifications/NotificationRow';
import { NotificationSectionHeader } from '@/components/fb/notifications/NotificationSectionHeader';
import { NotificationsEmptyState } from '@/components/fb/notifications/NotificationsEmptyState';
import { Snackbar } from '@/components/fb/notifications/Snackbar';
import type {
  NotificationFilter,
  NotificationRowItem,
  NotificationSection,
  RequestResolution,
} from '@/components/fb/notifications/types';
import { success, tap } from '@/lib/haptics';
import { notifications } from '@/lib/mock';
import { useUIStore } from '@/lib/store/ui';
import { colors, spacing } from '@/lib/theme';

/** Rows shown under "New" before "See all" is tapped. */
const NEW_PREVIEW_COUNT = 4;

type SheetState = { id: string | null; visible: boolean };
type SnackState = { key: number; message: string; undo?: () => void };

function withId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.add(id);
  return next;
}

function withoutId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

export default function NotificationsScreen() {
  const clearNotificationCount = useUIStore((s) => s.clearNotificationCount);

  // Opening the tab clears the red count on the tab bar; rows keep their own unread tint.
  useFocusEffect(
    useCallback(() => {
      clearNotificationCount();
    }, [clearNotificationCount]),
  );

  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [unreadIds, setUnreadIds] = useState<Set<string>>(
    () => new Set(notifications.filter((n) => n.unread).map((n) => n.id)),
  );
  // Rows read while the Unread filter is showing stay in place (untinted) until the filter changes.
  const [lingerIds, setLingerIds] = useState<Set<string>>(() => new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [resolutions, setResolutions] = useState<Record<string, RequestResolution>>({});
  const [newExpanded, setNewExpanded] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ id: null, visible: false });
  const [snack, setSnack] = useState<SnackState | null>(null);

  const showSnack = useCallback((message: string, undo?: () => void) => {
    setSnack({ key: Date.now(), message, undo });
  }, []);
  const dismissSnack = useCallback(() => setSnack(null), []);

  // Functional updates keep this callback stable, so memoized rows only re-render when their own state changes.
  const markRead = useCallback(
    (id: string) => {
      setUnreadIds((prev) => (prev.has(id) ? withoutId(prev, id) : prev));
      if (filter === 'unread') setLingerIds((prev) => (prev.has(id) ? prev : withId(prev, id)));
    },
    [filter],
  );

  const markAllRead = useCallback(() => {
    if (unreadIds.size === 0) {
      showSnack("You're all caught up.");
      return;
    }
    tap();
    setUnreadIds(new Set());
    setLingerIds(new Set());
  }, [showSnack, unreadIds]);

  const changeFilter = useCallback((next: NotificationFilter) => {
    setLingerIds(new Set());
    setFilter(next);
  }, []);

  const resolveRequest = useCallback(
    (id: string, resolution: RequestResolution) => {
      if (resolution === 'confirmed') success();
      setResolutions((prev) => ({ ...prev, [id]: resolution }));
      markRead(id);
    },
    [markRead],
  );
  const confirmRequest = useCallback((id: string) => resolveRequest(id, 'confirmed'), [resolveRequest]);
  const deleteRequest = useCallback((id: string) => resolveRequest(id, 'deleted'), [resolveRequest]);

  const openSheet = useCallback((id: string) => setSheet({ id, visible: true }), []);
  // Keep the id while the sheet fades out so its content does not blank mid-animation.
  const closeSheet = useCallback(() => setSheet((prev) => ({ ...prev, visible: false })), []);

  const handleSheetAction = useCallback(
    (action: NotificationSheetAction) => {
      const id = sheet.id;
      closeSheet();
      if (id == null) return;

      if (action === 'toggle-read') {
        if (unreadIds.has(id)) {
          markRead(id);
        } else {
          setUnreadIds((prev) => withId(prev, id));
          setLingerIds((prev) => withoutId(prev, id));
        }
        return;
      }

      if (action === 'remove') {
        setRemovedIds((prev) => withId(prev, id));
        showSnack('Notification removed.', () => setRemovedIds((prev) => withoutId(prev, id)));
        return;
      }

      showSnack("You won't get notifications like this anymore.");
    },
    [closeSheet, markRead, sheet.id, showSnack, unreadIds],
  );

  const sections = useMemo<NotificationSection[]>(() => {
    const rows: NotificationRowItem[] = notifications
      .filter((n) => !removedIds.has(n.id))
      .filter((n) => filter === 'all' || unreadIds.has(n.id) || lingerIds.has(n.id))
      .map((n) => ({ notification: n, unread: unreadIds.has(n.id), resolution: resolutions[n.id] }));

    const fresh = rows.filter((row) => row.notification.section === 'new');
    const earlier = rows.filter((row) => row.notification.section === 'earlier');
    const visibleFresh = newExpanded || filter === 'unread' ? fresh : fresh.slice(0, NEW_PREVIEW_COUNT);

    const result: NotificationSection[] = [];
    if (visibleFresh.length > 0) {
      result.push({ key: 'new', title: 'New', data: visibleFresh, hiddenCount: fresh.length - visibleFresh.length });
    }
    if (earlier.length > 0) {
      result.push({ key: 'earlier', title: 'Earlier', data: earlier, hiddenCount: 0 });
    }
    return result;
  }, [filter, lingerIds, newExpanded, removedIds, resolutions, unreadIds]);

  const headerActions = useMemo<HeaderAction[]>(
    () => [
      { icon: 'check', accessibilityLabel: 'Mark all as read', background: true, onPress: markAllRead },
      { icon: 'search', accessibilityLabel: 'Search notifications', background: true },
    ],
    [markAllRead],
  );

  const renderItem = useCallback(
    ({ item }: SectionListRenderItemInfo<NotificationRowItem, NotificationSection>) => (
      <NotificationRow
        notification={item.notification}
        unread={item.unread}
        resolution={item.resolution}
        onPress={markRead}
        onPressMore={openSheet}
        onConfirm={confirmRequest}
        onDelete={deleteRequest}
      />
    ),
    [confirmRequest, deleteRequest, markRead, openSheet],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<NotificationRowItem, NotificationSection> }) => (
      <NotificationSectionHeader
        title={section.title}
        actionLabel={section.hiddenCount > 0 ? 'See all' : undefined}
        onPressAction={() => setNewExpanded(true)}
      />
    ),
    [],
  );

  const sheetNotification = sheet.id ? notifications.find((n) => n.id === sheet.id) ?? null : null;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Notifications" actions={headerActions} />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.notification.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={<FilterChips value={filter} onChange={changeFilter} />}
        ListEmptyComponent={
          filter === 'unread' ? (
            <NotificationsEmptyState
              icon="check-circle"
              title="You're all caught up"
              message="You have no unread notifications."
              actionLabel="See all notifications"
              onPressAction={() => changeFilter('all')}
            />
          ) : (
            <NotificationsEmptyState
              icon="bell"
              title="No notifications"
              message="When friends react, comment or send you requests, you'll see it here."
            />
          )
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      />

      {snack ? (
        <Snackbar
          key={snack.key}
          message={snack.message}
          actionLabel={snack.undo ? 'Undo' : undefined}
          onAction={() => {
            snack.undo?.();
            setSnack(null);
          }}
          onDismiss={dismissSnack}
        />
      ) : null}

      <NotificationActionSheet
        visible={sheet.visible}
        notification={sheetNotification}
        segments={sheetNotification ? segmentsFor(sheetNotification, resolutions[sheetNotification.id]) : []}
        unread={sheet.id != null && unreadIds.has(sheet.id)}
        onSelect={handleSheetAction}
        onClose={closeSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxl },
});
