import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { selection } from '@/lib/haptics';
import { useUIStore } from '@/lib/store/ui';
import { colors } from '@/lib/theme';

/**
 * Native iOS tab bar (floating liquid glass on iOS 26): five icon-only tabs plus a
 * separate search tab (role="search"), which iOS 26 draws as its own glass circle.
 *
 * Automatic content insets are disabled on every tab: screens draw their own headers
 * with the top safe-area inset and pad scroll content by `useTabBarHeight()` so it
 * scrolls under the floating bar.
 */
export default function TabsLayout() {
  const notificationCount = useUIStore((s) => s.notificationCount);

  return (
    <NativeTabs
      tintColor={colors.blue}
      minimizeBehavior="never"
      screenListeners={{ tabPress: () => selection() }}
    >
      <NativeTabs.Trigger
        name="index"
        accessibilityLabel="Home"
        disableAutomaticContentInsets
        contentStyle={{ backgroundColor: colors.white }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="reels"
        accessibilityLabel="Reels"
        disableAutomaticContentInsets
        contentStyle={{ backgroundColor: colors.darkBg }}
        // Dark glass tab bar while Reels is showing.
        unstable_nativeProps={{ ios: { experimental_userInterfaceStyle: 'dark' } }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'play.rectangle', selected: 'play.rectangle.fill' }} />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="moves"
        accessibilityLabel="Moves"
        disableAutomaticContentInsets
        contentStyle={{ backgroundColor: colors.white }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="notifications"
        accessibilityLabel={notificationCount > 0 ? `Notifications, ${notificationCount} new` : 'Notifications'}
        disableAutomaticContentInsets
        contentStyle={{ backgroundColor: colors.white }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'bell', selected: 'bell.fill' }} />
        <NativeTabs.Trigger.Label hidden />
        {notificationCount > 0 ? (
          <NativeTabs.Trigger.Badge>{notificationCount > 99 ? '99+' : String(notificationCount)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="profile"
        accessibilityLabel="Profile"
        disableAutomaticContentInsets
        contentStyle={{ backgroundColor: colors.white }}
      >
        <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger
        name="search"
        role="search"
        accessibilityLabel="Search"
        disableAutomaticContentInsets
        contentStyle={{ backgroundColor: colors.white }}
      >
        <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        <NativeTabs.Trigger.Label hidden />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
