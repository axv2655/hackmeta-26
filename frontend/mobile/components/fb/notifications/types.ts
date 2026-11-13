import type { Notification } from '@/lib/mock';

/** Read-state filter, switched from the header "more" menu. */
export type NotificationFilter = 'all' | 'unread';

/** How a pending friend request was answered. */
export type RequestResolution = 'confirmed' | 'deleted';

/** One list item: the seeded notification plus its local, mutable state. */
export type NotificationRowItem = {
  notification: Notification;
  unread: boolean;
  resolution?: RequestResolution;
};

export type NotificationSection = {
  /** 'requests' is the "Pending friend requests" module; its items render as request cards. */
  key: 'new' | 'requests' | 'earlier';
  title: string;
  data: NotificationRowItem[];
  /** Requests only: pending requests held back behind "See N friend requests". */
  hiddenCount: number;
  /** Requests only: total pending (unanswered) requests, for the "See N friend requests" link. */
  pendingCount: number;
};
