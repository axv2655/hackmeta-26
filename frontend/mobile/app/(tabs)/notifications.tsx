import { useCallback, useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
  type SectionListRenderItemInfo,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { FilterChips } from '@/components/fb/notifications/FilterChips';
import { FriendRequestCard, SeeFriendRequestsLink, SeePreviousButton } from '@/components/fb/notifications/FriendRequests';
import {
  NotificationActionSheet,
  type NotificationSheetAction,
} from '@/components/fb/notifications/NotificationActionSheet';
import { NotificationRow, segmentsFor } from '@/components/fb/notifications/NotificationRow';
import { NotificationSectionHeader } from '@/components/fb/notifications/NotificationSectionHeader';
import { NotificationsEmptyState } from '@/components/fb/notifications/NotificationsEmptyState';
import { MovesInbox } from '@/components/moves/MovesInbox';
import { useInbox } from '@/lib/store/inbox';
import { Snackbar } from '@/components/fb/notifications/Snackbar';
import type {
  NotificationFilter,
  NotificationRowItem,
  NotificationSection,
  RequestResolution,
} from '@/components/fb/notifications/types';
import { success, tap } from '@/lib/haptics';
import { notifications, type Notification } from '@/lib/mock';
import { useUIStore } from '@/lib/store/ui';
import { colors, spacing } from '@/lib/theme';

/** Rows shown under "Earlier" before "See previous notifications" is tapped. */
const EARLIER_PREVIEW_COUNT = 4;
/** Request cards shown in "Pending friend requests" before "See N friend requests" is tapped. */
const REQUEST_PREVIEW_COUNT = 1;

/** Friend requests with Confirm / Delete live in the "Pending friend requests" module, not as rows. */
function isPendingRequest(notification: Notification): boolean {
  return notification.type === 'friend-request' && notification.hasActions;
}

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
  const tabBarHeight = useTabBarHeight();

  // Opening the tab clears the red count on the tab bar; rows keep their own unread tint.
  useFocusEffect(
    useCallback(() => {
      clearNotificationCount();
      void useInbox.getState().load();
      const read = setTimeout(() => void useInbox.getState().markAllRead(), 2500);
      return () => clearTimeout(read);
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
  const [earlierExpanded, setEarlierExpanded] = useState(false);
  const [requestsExpanded, setRequestsExpanded] = useState(false);
  const [requestsHidden, setRequestsHidden] = useState(false);
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

  const dismissRequests = useCallback(() => {
    tap();
    setRequestsHidden(true);
    showSnack('Friend requests hidden.', () => setRequestsHidden(false));
  }, [showSnack]);

  const expandRequests = useCallback(() => {
    tap();
    setRequestsExpanded(true);
  }, []);

  const expandEarlier = useCallback(() => setEarlierExpanded(true), []);

  // Mark-all-read and the Unread filter live behind the header's "more" button.
  const openHeaderMenu = useCallback(() => {
    const filterLabel = filter === 'unread' ? 'Show all notifications' : 'Show unread only';
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Mark all as read', filterLabel, 'Cancel'], cancelButtonIndex: 2 },
      (index) => {
        if (index === 0) markAllRead();
        else if (index === 1) changeFilter(filter === 'unread' ? 'all' : 'unread');
      },
    );
  }, [changeFilter, filter, markAllRead]);

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

  const { sections, earlierHidden } = useMemo(() => {
    const items: NotificationRowItem[] = notifications
      .filter((n) => !removedIds.has(n.id))
      .filter((n) => filter === 'all' || unreadIds.has(n.id) || lingerIds.has(n.id))
      .map((n) => ({ notification: n, unread: unreadIds.has(n.id), resolution: resolutions[n.id] }));

    const requests = items.filter((item) => isPendingRequest(item.notification));
    const rows = items.filter((item) => !isPendingRequest(item.notification));

    const fresh = rows.filter((row) => row.notification.section === 'new');
    const earlier = rows.filter((row) => row.notification.section === 'earlier');
    const visibleEarlier = earlierExpanded || filter === 'unread' ? earlier : earlier.slice(0, EARLIER_PREVIEW_COUNT);
    const visibleRequests = requestsExpanded ? requests : requests.slice(0, REQUEST_PREVIEW_COUNT);

    const result: NotificationSection[] = [];
    if (fresh.length > 0) {
      result.push({ key: 'new', title: 'New', data: fresh, hiddenCount: 0, pendingCount: 0 });
    }
    if (!requestsHidden && visibleRequests.length > 0) {
      result.push({
        key: 'requests',
        title: 'Pending friend requests',
        data: visibleRequests,
        hiddenCount: requests.length - visibleRequests.length,
        pendingCount: requests.filter((item) => item.resolution == null).length,
      });
    }
    if (visibleEarlier.length > 0) {
      result.push({ key: 'earlier', title: 'Earlier', data: visibleEarlier, hiddenCount: 0, pendingCount: 0 });
    }
    return { sections: result, earlierHidden: earlier.length - visibleEarlier.length };
  }, [earlierExpanded, filter, lingerIds, removedIds, requestsExpanded, requestsHidden, resolutions, unreadIds]);

  const headerActions = useMemo<HeaderAction[]>(
    () => [
      { icon: 'messenger', variant: 'filled', accessibilityLabel: 'Messenger' },
      { icon: 'more', variant: 'outline', accessibilityLabel: 'More notification options', onPress: openHeaderMenu },
    ],
    [openHeaderMenu],
  );

  const renderItem = useCallback(
    ({ item, section }: SectionListRenderItemInfo<NotificationRowItem, NotificationSection>) =>
      section.key === 'requests' ? (
        <FriendRequestCard
          notification={item.notification}
          resolution={item.resolution}
          onPress={markRead}
          onConfirm={confirmRequest}
          onDelete={deleteRequest}
        />
      ) : (
        <NotificationRow notification={item.notification} unread={item.unread} onPress={markRead} onPressMore={openSheet} />
      ),
    [confirmRequest, deleteRequest, markRead, openSheet],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<NotificationRowItem, NotificationSection> }) => (
      <NotificationSectionHeader
        title={section.title}
        onDismiss={section.key === 'requests' ? dismissRequests : undefined}
        dismissLabel="Hide pending friend requests"
      />
    ),
    [dismissRequests],
  );

  const renderSectionFooter = useCallback(
    ({ section }: { section: SectionListData<NotificationRowItem, NotificationSection> }) =>
      section.key === 'requests' && section.hiddenCount > 0 ? (
        <SeeFriendRequestsLink count={section.pendingCount} onPress={expandRequests} />
      ) : null,
    [expandRequests],
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
        renderSectionFooter={renderSectionFooter}
        ListHeaderComponent={
          <>
            {filter === 'unread' ? <FilterChips value={filter} onChange={changeFilter} /> : null}
            <MovesInbox />
          </>
        }
        ListFooterComponent={earlierHidden > 0 ? <SeePreviousButton onPress={expandEarlier} /> : null}
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
        contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
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
});
