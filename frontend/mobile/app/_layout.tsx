import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBar } from '@/components/common/OfflineBar';
import { Toast } from '@/components/common/Toast';
import { InAppBanner } from '@/components/InAppBanner';
import { SplashOverlay } from '@/components/fb/SplashOverlay';
import { ProximityPrompt } from '@/components/moves/ProximityPrompt';
import '@/components/shell/logoutResets';
import { RouteError } from '@/components/shell/RouteError';
import { useShellSession } from '@/components/shell/useShellSession';
import { useBleProximity } from '@/lib/ble';
import { useCalendarSync } from '@/lib/calendar';
import { useLocationPing } from '@/lib/locationPing';
import { usePush } from '@/lib/push';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

// Keeps the tabs underneath when a deep link opens a stack screen directly.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

/** A render error anywhere below shows "Something went wrong" + Try again, never a red screen. */
export const ErrorBoundary = RouteError;

const SLIDE_UP = { presentation: 'fullScreenModal', animation: 'slide_from_bottom' } as const;
const MODAL = { presentation: 'modal' } as const;

/** Pushed screens under the signed-in guard (IMPLEMENTATION_PLAN.md D). */
const PUSHED = [
  'menu',
  'post/share',
  'move/[id]/index',
  'move/[id]/moments',
  'calendar',
  'demo',
  'leaderboards',
  'mark/[id]',
  'saved',
  'friends',
  'user/[id]',
  'settings/index',
  'settings/privacy',
  'settings/hidden',
  'settings/autojoin',
  'settings/notifications',
  'settings/muse',
  'circles/index',
  'circles/[id]',
  'groups',
  // "Hey Meta, start a Move": voice -> draft -> confirm (ARCHITECTURE.md 11.4).
  'glasses',
] as const;

const MODALS = ['move/[id]/rate', 'suggestion/[id]', 'profile/edit'] as const;

/** Full-screen sheets that slide up over the whole app, like Facebook's composer. */
const SLIDE_UPS = ['post/new', 'move/new', 'onboarding', 'move/[id]/snap'] as const;

/** Thin "Can't reach Moves" bar under the status bar, over every screen. */
function TopOfflineBar() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.offline, { top: insets.top }]} pointerEvents="none">
      <OfflineBar />
    </View>
  );
}

function Shell() {
  // Live data: one socket for the signed-in user, push, and session upkeep.
  useRealtime();
  usePush();
  useShellSession();
  useLocationPing(); // coarse phone point for the glasses/MCP place lookup
  useBleProximity(); // real BLE co-presence: auto-arrive, join prompts
  useCalendarSync(); // phone calendar busy blocks, so Muse can find free windows
  const hydrated = useSession((s) => s.hydrated);
  const signedIn = useSession((s) => s.userId !== '');

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.white },
        }}
      >
        {/* Nobody signed in on this phone: only the login screen. */}
        <Stack.Protected guard={hydrated && !signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          {PUSHED.map((name) => (
            <Stack.Screen key={name} name={name} />
          ))}
          {MODALS.map((name) => (
            <Stack.Screen key={name} name={name} options={MODAL} />
          ))}
          {SLIDE_UPS.map((name) => (
            <Stack.Screen key={name} name={name} options={SLIDE_UP} />
          ))}
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
      <TopOfflineBar />
      <InAppBanner />
      <ProximityPrompt />
      <Toast />
      <SplashOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Shell />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  offline: { position: 'absolute', left: 0, right: 0, zIndex: 950 },
});
