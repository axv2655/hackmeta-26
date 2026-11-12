import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { selection } from '@/lib/haptics';
import { useUIStore } from '@/lib/store/ui';
import { colors, hairlineWidth, layout, type as typeScale } from '@/lib/theme';

/** Tab bar content height, excluding the bottom safe-area inset. */
export const TAB_BAR_HEIGHT = layout.tabBarHeight;

/** Route name (file under app/(tabs)) -> label and glyph. Order comes from the Tabs layout. */
export const TAB_CONFIG: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  reels: { label: 'Reels', icon: 'reels' },
  moves: { label: 'Moves', icon: 'moves' },
  profile: { label: 'Profile', icon: 'profile' },
  notifications: { label: 'Notifications', icon: 'notifications' },
  menu: { label: 'Menu', icon: 'menu' },
};

/** Route whose focus switches the bar to its black variant. */
const DARK_ROUTE = 'reels';

const INDICATOR_HEIGHT = 3;
const ICON_SIZE = 26;

/** Space under the tab row: the home-indicator inset, or a small pad where there is none (web, Android). */
function bottomPadding(insetBottom: number): number {
  return insetBottom > 0 ? insetBottom : 6;
}

/** Total on-screen height of the tab bar for the current device (content + bottom padding). */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + bottomPadding(insets.bottom);
}

/**
 * Custom bottom tab bar: six equal tabs, black outline icons with 11pt labels,
 * the active tab in blue with a filled icon and a 3pt line across its top edge.
 * Turns black with white icons while the Reels tab is focused. The red count
 * on Notifications comes from `useUIStore().notificationCount` (or the route's
 * `tabBarBadge` option when set).
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const notificationCount = useUIStore((s) => s.notificationCount);
  const dark = state.routes[state.index]?.name === DARK_ROUTE;

  const inactiveColor = dark ? colors.darkText : colors.text;
  const activeColor = dark ? colors.darkText : colors.blue;

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          height: TAB_BAR_HEIGHT + bottomPadding(insets.bottom),
          paddingBottom: bottomPadding(insets.bottom),
          backgroundColor: dark ? colors.darkBg : colors.white,
          borderTopColor: dark ? colors.darkHairline : colors.hairline,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const config = TAB_CONFIG[route.name];
        if (!config) return null;

        const options = descriptors[route.key]?.options;
        const focused = state.index === index;
        const color = focused ? activeColor : inactiveColor;
        const label = options?.title ?? config.label;

        const optionBadge = options?.tabBarBadge;
        const badge: number | string | undefined =
          optionBadge ?? (route.name === 'notifications' && notificationCount > 0 ? notificationCount : undefined);

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            selection();
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              options?.tabBarAccessibilityLabel ?? (badge != null ? `${label}, ${badge} new` : label)
            }
            onPress={onPress}
            onLongPress={onLongPress}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <View style={[styles.indicator, focused && { backgroundColor: activeColor }]} />
            <View style={styles.iconWrap}>
              <Icon name={config.icon} filled={focused} size={ICON_SIZE} color={color} />
              {badge != null ? (
                <View style={[styles.badge, { borderColor: dark ? colors.darkBg : colors.white }]}>
                  <Text style={styles.badgeText} allowFontScaling={false} numberOfLines={1}>
                    {typeof badge === 'number' && badge > 99 ? '99+' : badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.labelWrap}>
              <Text style={[styles.label, { color }]} numberOfLines={1} allowFontScaling={false}>
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    height: TAB_BAR_HEIGHT,
  },
  tabPressed: { opacity: 0.55 },
  indicator: {
    alignSelf: 'stretch',
    height: INDICATOR_HEIGHT,
    marginHorizontal: 2,
    marginTop: -hairlineWidth,
    borderBottomLeftRadius: 1.5,
    borderBottomRightRadius: 1.5,
    backgroundColor: colors.transparent,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    marginTop: 5,
  },
  // Wider than one tab so "Notifications" is never truncated; it overflows evenly on both sides.
  labelWrap: {
    width: 84,
    marginTop: 3,
    alignItems: 'center',
  },
  label: {
    ...typeScale.tab,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    left: ICON_SIZE - 12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4.5,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeRed,
  },
  badgeText: {
    color: colors.white,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
  },
});

export default TabBar;
