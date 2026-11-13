import { Image } from 'expo-image';

// Facebook's full-color menu icons, the same files as frontend/web/public/fb/menu.
// Keyed by menu shortcut / row id.
const icons = {
  'shortcut-friends': require('@/assets/meta/menu/friends.webp'),
  'shortcut-saved': require('@/assets/meta/menu/saved.webp'),
  'shortcut-groups': require('@/assets/meta/menu/groups.webp'),
  'shortcut-events': require('@/assets/meta/menu/events.webp'),
  'shortcut-reels': require('@/assets/meta/menu/reels.webp'),
  'shortcut-memories': require('@/assets/meta/menu/memories.webp'),
  'shortcut-marketplace': require('@/assets/meta/menu/marketplace.webp'),
  'shortcut-feeds': require('@/assets/meta/menu/feeds.webp'),
  'shortcut-pages': require('@/assets/meta/menu/pages.webp'),
  'shortcut-gaming': require('@/assets/meta/menu/gaming-video.webp'),
  'row-help': require('@/assets/meta/menu/support.webp'),
  'row-help-center': require('@/assets/meta/menu/support.webp'),
  'row-meta-instagram': require('@/assets/meta/menu/instagram.webp'),
  'row-meta-whatsapp': require('@/assets/meta/menu/whatsapp.webp'),
  'row-meta-threads': require('@/assets/meta/menu/threads.webp'),
} as const;

export type MetaMenuId = keyof typeof icons;
export function isMetaMenuId(id: string): id is MetaMenuId {
  return id in icons;
}

export function MetaMenuIcon({ id, size = 32 }: { id: MetaMenuId; size?: number }) {
  return <Image source={icons[id]} style={{ width: size, height: size }} contentFit="contain" accessible={false} />;
}
