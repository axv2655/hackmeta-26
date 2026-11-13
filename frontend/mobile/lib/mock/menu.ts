import { colors } from '@/lib/theme';

import type { MenuRow, MenuShortcut } from './types';

/**
 * Shortcut tiles for the Menu grid (two columns), in display order. Tiles with
 * an `href` open a real screen; the rest open the "Coming soon" sheet. Badges
 * are live (the Menu sets Friends from pending requests), never seeded.
 */
export const menuShortcuts: MenuShortcut[] = [
  { id: 'shortcut-friends', label: 'Friends', icon: 'friends', color: colors.blue, href: '/friends' },
  { id: 'shortcut-moves', label: 'Moves', icon: 'moves-filled', color: '#F7923B', href: '/moves' },
  { id: 'shortcut-groups', label: 'Groups', icon: 'users', color: colors.blue, href: '/circles' },
  { id: 'shortcut-reels', label: 'Reels', icon: 'reels-filled', color: '#F5428D', href: '/reels' },
  { id: 'shortcut-memories', label: 'Memories', icon: 'history', color: colors.blue, href: '/memories' },
  { id: 'shortcut-saved', label: 'Saved', icon: 'bookmark', color: '#A033FF', href: '/saved' },
  { id: 'shortcut-marketplace', label: 'Marketplace', icon: 'store', color: colors.blue },
  { id: 'shortcut-events', label: 'Events', icon: 'calendar', color: colors.badgeRed, href: '/calendar' },
  { id: 'shortcut-pages', label: 'Pages', icon: 'flag', color: '#F7923B' },
  { id: 'shortcut-feeds', label: 'Feeds', icon: 'rss', color: colors.blue },
  { id: 'shortcut-gaming', label: 'Gaming', icon: 'gamepad', color: colors.blue },
  { id: 'shortcut-birthdays', label: 'Birthdays', icon: 'cake', color: '#F5428D' },
];

/** Expandable settings rows under the shortcut grid. */
export const menuRows: MenuRow[] = [
  {
    id: 'row-help',
    label: 'Help & support',
    icon: 'help',
    children: [
      { id: 'row-help-center', label: 'Help Center', icon: 'help' },
      { id: 'row-support-inbox', label: 'Support inbox', icon: 'message' },
      { id: 'row-report', label: 'Report a problem', icon: 'flag' },
      { id: 'row-safety', label: 'Safety', icon: 'shield' },
    ],
  },
  {
    id: 'row-settings',
    label: 'Settings & privacy',
    icon: 'settings',
    children: [
      { id: 'row-settings-main', label: 'Settings', icon: 'settings' },
      { id: 'row-privacy-shortcuts', label: 'Privacy shortcuts', icon: 'lock' },
      { id: 'row-your-time', label: 'Your time on Facebook', icon: 'clock' },
      { id: 'row-notifications', label: 'Notification settings', icon: 'bell' },
    ],
  },
  {
    id: 'row-professional',
    label: 'Professional access',
    icon: 'star',
    children: [{ id: 'row-professional-mode', label: 'Turn on professional mode', icon: 'sparkles' }],
  },
];

/** The standalone button at the very bottom of the Menu. */
export const logoutRow: MenuRow = { id: 'row-logout', label: 'Log out', icon: 'logout', destructive: true };
