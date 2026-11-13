import type { IconName } from '@/components/ui/Icon';
import { menuRows, menuShortcuts, type MenuRow, type MenuShortcut } from '@/lib/mock';
import { colors } from '@/lib/theme';

/** Tile colors that have no theme token (Facebook's shortcut-icon accents). */
const accent = {
  orange: '#F7923B',
  pink: '#F5428D',
  purple: '#A033FF',
  teal: '#2ABBA7',
} as const;

function tile(id: string, label: string, icon: IconName, color: string, href?: string): MenuShortcut {
  return { id, label, icon, color, href };
}

/** Prefer the seeded shortcut (so labels and icons stay in one place); fall back to a local one. */
function seeded(fallback: MenuShortcut): MenuShortcut {
  return menuShortcuts.find((s) => s.id === fallback.id) ?? fallback;
}

/** The team's own feature: a full-width tile at the top of the grid, tagged "New". */
export const movesShortcut: MenuShortcut = {
  ...seeded(tile('shortcut-moves', 'Moves', 'moves-filled', accent.orange)),
  href: '/moves',
};

export const MOVES_TAGLINE = 'See what your friends are up to right now';

/** Always-visible tiles, in display order (two columns). */
export const primaryShortcuts: MenuShortcut[] = [
  { ...seeded(tile('shortcut-friends', 'Friends', 'friends', colors.blue)), href: '/friends' },
  { ...seeded(tile('shortcut-saved', 'Saved', 'bookmark', accent.purple)), href: '/saved' },
  { ...seeded(tile('shortcut-groups', 'Groups', 'users', colors.blue)), href: '/circles' },
  tile('shortcut-crews', 'Crews', 'sparkles', accent.orange, '/groups'),
  { ...seeded(tile('shortcut-events', 'Events', 'calendar', colors.badgeRed)), href: '/calendar' },
  tile('shortcut-leaderboards', 'Leaderboards', 'star', accent.teal, '/leaderboards'),
  { ...seeded(tile('shortcut-reels', 'Reels', 'reels-filled', accent.pink)), href: '/reels' },
  seeded(tile('shortcut-memories', 'Memories', 'history', colors.blue)),
  seeded(tile('shortcut-marketplace', 'Marketplace', 'store', colors.blue)),
  seeded(tile('shortcut-feeds', 'Feeds', 'rss', colors.blue)),
];

/** Revealed by "See more". */
export const moreShortcuts: MenuShortcut[] = [
  seeded(tile('shortcut-pages', 'Pages', 'flag', accent.orange)),
  seeded(tile('shortcut-gaming', 'Gaming', 'gamepad', colors.blue)),
  seeded(tile('shortcut-birthdays', 'Birthdays', 'cake', accent.pink)),
  seeded(tile('shortcut-fundraisers', 'Fundraisers', 'heart-filled', accent.teal)),
];

/** Accordion rows that open a real screen. Every other row opens "Coming soon". */
export const ROW_HREFS: Readonly<Record<string, string>> = {
  'row-settings-main': '/settings',
  'row-privacy-shortcuts': '/settings/privacy',
  'row-notifications': '/settings/notifications',
};

export const ALSO_FROM_META_ID = 'row-also-from-meta';

const helpFallback: MenuRow = {
  id: 'row-help',
  label: 'Help & support',
  icon: 'help',
  children: [
    { id: 'row-help-center', label: 'Help Center', icon: 'help' },
    { id: 'row-support-inbox', label: 'Support inbox', icon: 'message' },
    { id: 'row-report', label: 'Report a problem', icon: 'flag' },
  ],
};

const settingsFallback: MenuRow = {
  id: 'row-settings',
  label: 'Settings & privacy',
  icon: 'settings',
  children: [
    { id: 'row-settings-main', label: 'Settings', icon: 'settings' },
    { id: 'row-privacy-shortcuts', label: 'Privacy shortcuts', icon: 'lock' },
    { id: 'row-your-time', label: 'Your time on Facebook', icon: 'clock' },
    { id: 'row-notifications', label: 'Notification settings', icon: 'bell' },
  ],
};

const alsoFromMeta: MenuRow = {
  id: ALSO_FROM_META_ID,
  label: 'Also from Meta',
  // Placeholder glyph: the screen swaps in the Meta symbol for this row.
  icon: 'sparkles',
  children: [
    { id: 'row-meta-messenger', label: 'Messenger', icon: 'messenger' },
    { id: 'row-meta-instagram', label: 'Instagram', icon: 'camera' },
    { id: 'row-meta-whatsapp', label: 'WhatsApp', icon: 'message' },
    { id: 'row-meta-threads', label: 'Threads', icon: 'at-sign' },
  ],
};

function seededRow(fallback: MenuRow): MenuRow {
  return menuRows.find((r) => r.id === fallback.id) ?? fallback;
}

/** Accordion sections under the grid, in display order. */
export const menuSections: MenuRow[] = [seededRow(helpFallback), seededRow(settingsFallback), alsoFromMeta];

/** Split a list into rows of `size` for the two-column grid. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
