import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { GlassContainer } from 'expo-glass-effect';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { glassAvailable, GlassSurface } from '@/components/ui/Glass';
import { Icon, type IconName } from '@/components/ui/Icon';
import { selection } from '@/lib/haptics';
import { useUIStore } from '@/lib/store/ui';
import { colors, layout } from '@/lib/theme';

/**
 * Floating liquid-glass tab bar, iOS 26 style: a glass pill with five icon-only
 * tabs plus a separate glass search circle on the right.
 *
 * Why not the native UITabBar (NativeTabs)? react-native-screens 4.26 builds the
 * bar with the legacy UITabBarController API, which caps iPhone at five items and
 * folds the rest into a "More" tab, so the search tab can't float on its own.
 * This bar uses the same native glass material (expo-glass-effect) instead.
 */

/** Visual height of the floating tab bar pill (and the search circle's diameter). */
export const TAB_BAR_HEIGHT: number = layout.tabBarHeight;

/** Device home-indicator inset, independent of where the hook is called. */
const DEVICE_BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 34;

/** Total bottom space scroll content must clear: bar + gap + the bottom safe-area inset. */
export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return TAB_BAR_HEIGHT + layout.tabBarGap + Math.max(insets.bottom, DEVICE_BOTTOM_INSET);
}

/** Route name (file under app/(tabs)) -> glyphs. */
const TABS: Record<string, { label: string; icon: IconName; iconFilled: IconName }> = {
  index: { label: 'Home', icon: 'home', iconFilled: 'home-filled' },
  reels: { label: 'Reels', icon: 'reels', iconFilled: 'reels-filled' },
  moves: { label: 'Moves', icon: 'moves', iconFilled: 'moves-filled' },
  notifications: { label: 'Notifications', icon: 'notifications', iconFilled: 'notifications-filled' },
  profile: { label: 'Profile', icon: 'profile', iconFilled: 'profile-filled' },
};
const SEARCH_ROUTE = 'search';
const DARK_ROUTE = 'reels';

const ICON_SIZE = 28;
const SIDE_INSET = 16;
const PILL_PADDING = 5;

/** Distance from the bottom of the screen to the bar, matching the native iOS 26 bar. */
function bottomOffset(insetBottom: number): number {
  return insetBottom > 0 ? Math.max(insetBottom - 14, 12) : 12;
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const notificationCount = useUIStore((s) => s.notificationCount);
  const focusedName = state.routes[state.index]?.name;
  const dark = focusedName === DARK_ROUTE;

  const fg = dark ? colors.darkText : colors.text;
  const activeFg = dark ? colors.darkText : colors.blue;
  const activeBg = dark ? 'rgba(255,255,255,0.18)' : colors.chipSelectedBg;
  const tint = dark ? 'dark' : 'light';

  const press = (routeKey: string, routeName: string, params: object | undefined, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      selection();
      navigation.navigate(routeName, params);
    }
  };

  const tabRoutes = state.routes.filter((r) => TABS[r.name]);
  const searchRoute = state.routes.find((r) => r.name === SEARCH_ROUTE);
  const searchFocused = focusedName === SEARCH_ROUTE;

  const content = (
    <>
      <GlassSurface tint={tint} interactive radius={TAB_BAR_HEIGHT / 2} style={styles.pill}>
        <View accessibilityRole="tablist" style={styles.pillRow}>
          {tabRoutes.map((route) => {
            const config = TABS[route.name]!;
            const focused = route.name === focusedName;
            const options = descriptors[route.key]?.options;
            const badge =
              options?.tabBarBadge ??
              (route.name === 'notifications' && notificationCount > 0 ? notificationCount : undefined);
            const label = options?.title ?? config.label;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={badge != null ? `${label}, ${badge} new` : label}
                onPress={() => press(route.key, route.name, route.params, focused)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={styles.tab}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.tabInner,
                      focused && { backgroundColor: activeBg },
                      pressed && !focused && styles.pressed,
                    ]}
                  >
                    <View style={styles.iconWrap}>
                      <Icon
                        name={focused ? config.iconFilled : config.icon}
                        size={ICON_SIZE}
                        color={focused ? activeFg : fg}
                      />
                      {badge != null ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText} allowFontScaling={false} numberOfLines={1}>
                            {typeof badge === 'number' && badge > 99 ? '99+' : badge}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>

      {searchRoute ? (
        <GlassSurface tint={tint} interactive radius={TAB_BAR_HEIGHT / 2} style={styles.search}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: searchFocused }}
            accessibilityLabel="Search"
            onPress={() => press(searchRoute.key, searchRoute.name, searchRoute.params, searchFocused)}
            style={({ pressed }) => [styles.searchInner, pressed && !searchFocused && styles.pressed]}
          >
            <Icon name="search" size={ICON_SIZE} color={searchFocused ? activeFg : fg} />
          </Pressable>
        </GlassSurface>
      ) : null}
    </>
  );

  return (
    <View pointerEvents="box-none" style={[styles.root, { bottom: bottomOffset(insets.bottom) }]}>
      {glassAvailable ? (
        <GlassContainer spacing={12} style={styles.row}>
          {content}
        </GlassContainer>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: SIDE_INSET,
    right: SIDE_INSET,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pill: {
    flex: 1,
    height: TAB_BAR_HEIGHT,
  },
  pillRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: PILL_PADDING,
  },
  tab: {
    flex: 1,
    height: TAB_BAR_HEIGHT - PILL_PADDING * 2,
  },
  tabInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: (TAB_BAR_HEIGHT - PILL_PADDING * 2) / 2,
  },
  pressed: { opacity: 0.55 },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  badge: {
    position: 'absolute',
    top: -6,
    left: ICON_SIZE - 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeRed,
  },
  badgeText: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  search: {
    width: TAB_BAR_HEIGHT,
    height: TAB_BAR_HEIGHT,
  },
  searchInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default TabBar;
