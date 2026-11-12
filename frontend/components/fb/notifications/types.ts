import type { Notification } from '@/lib/mock';

/** Filter chips above the list. */
export type NotificationFilter = 'all' | 'unread';

/** How an inline friend request was answered. */
export type RequestResolution = 'confirmed' | 'deleted';

/** One list row: the seeded notification plus its local, mutable state. */
export type NotificationRowItem = {
  notification: Notification;
  unread: boolean;
  resolution?: RequestResolution;
};

export type NotificationSection = {
  key: 'new' | 'earlier';
  title: string;
  data: NotificationRowItem[];
  /** Rows held back behind the "See all" link. */
  hiddenCount: number;
};
