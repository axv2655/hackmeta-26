import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout } from '@/lib/theme';

/**
 * The tab bar itself is the native iOS UITabBar (liquid glass on iOS 26), rendered
 * by `NativeTabs` in app/(tabs)/_layout.tsx. This module only exposes its metrics so
 * screens can let content scroll under the floating bar and still clear it.
 */

/** Visual height of the floating tab bar pill. */
export const TAB_BAR_HEIGHT: number = layout.tabBarHeight;

/** Device home-indicator inset, independent of where the hook is called. */
const DEVICE_BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 34;

/**
 * Total bottom space scroll content must clear: bar + gap + the bottom safe-area inset.
 *
 * Inside a native tab the local safe-area inset may already include the tab bar, so
 * the larger of the computed value and the local inset is returned (never double counted).
 */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return Math.max(TAB_BAR_HEIGHT + layout.tabBarGap + DEVICE_BOTTOM_INSET, insets.bottom);
}
