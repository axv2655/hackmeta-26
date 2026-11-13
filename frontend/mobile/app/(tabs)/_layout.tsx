import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/fb/TabBar';
import { RouteError } from '@/components/shell/RouteError';
import { colors } from '@/lib/theme';

/** A tab that throws while rendering shows "Something went wrong" + Try again. */
export const ErrorBoundary = RouteError;

/**
 * Five tabs plus Search, drawn by the custom floating liquid-glass TabBar
 * (see components/fb/TabBar.tsx for why this isn't the native UITabBar).
 * The bar floats over the scenes; screens pad their scroll content with
 * `useTabBarHeight()` so it scrolls under the glass.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Tabs are peers, not a hierarchy: switch instantly.
        animation: 'none',
        sceneStyle: { backgroundColor: colors.white },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="reels" options={{ title: 'Reels', sceneStyle: { backgroundColor: colors.darkBg } }} />
      <Tabs.Screen name="moves" options={{ title: 'Moves' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
    </Tabs>
  );
}
