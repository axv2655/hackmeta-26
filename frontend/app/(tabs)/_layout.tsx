import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/fb/TabBar';
import { colors } from '@/lib/theme';

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
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="menu" options={{ title: 'Menu' }} />
    </Tabs>
  );
}
