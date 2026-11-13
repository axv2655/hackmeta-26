import type { IconName } from '@/components/ui/Icon';

import type { MoveCategory } from './mock/moves';
import type { Category } from './types';

/**
 * Display data for the 10 backend Move categories. `pin` maps to the app's
 * map category (`MoveCategory`), which picks the Bitmoji pose on the map.
 */
export type CategoryMeta = { label: string; icon: IconName; color: string; pin: MoveCategory };

export const CATEGORY_INFO: Record<Category, CategoryMeta> = {
  food: { label: 'Food', icon: 'utensils', color: '#F5761A', pin: 'food' },
  coffee: { label: 'Coffee', icon: 'coffee', color: '#A0612B', pin: 'coffee' },
  study: { label: 'Study', icon: 'graduation', color: '#0866FF', pin: 'study' },
  fitness: { label: 'Fitness', icon: 'dumbbell', color: '#1F9D55', pin: 'gym' },
  nightlife: { label: 'Nightlife', icon: 'party', color: '#8B3DFF', pin: 'party' },
  outdoors: { label: 'Outdoors', icon: 'compass', color: '#2E8B57', pin: 'gym' },
  games: { label: 'Games', icon: 'gamepad', color: '#E4405F', pin: 'party' },
  shopping: { label: 'Shopping', icon: 'store', color: '#D6338A', pin: 'shopping' },
  errand: { label: 'Errand', icon: 'check-circle', color: '#5B6B7F', pin: 'shopping' },
  other: { label: 'Other', icon: 'sparkles', color: '#65676B', pin: 'music' },
};

/** Meta for any category string; unknown values read as "Other". */
export function categoryMeta(c: string): CategoryMeta {
  return Object.prototype.hasOwnProperty.call(CATEGORY_INFO, c) ? CATEGORY_INFO[c as Category] : CATEGORY_INFO.other;
}
