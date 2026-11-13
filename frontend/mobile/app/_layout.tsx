import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { InAppBanner } from '@/components/InAppBanner';
import { SplashOverlay } from '@/components/fb/SplashOverlay';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

// Keeps the tabs underneath when a deep link opens /post/new or /post/share directly.
export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  // Live data: one socket for the signed-in user, and the seeded users list
  // for names and the account switcher.
  useRealtime();
  useEffect(() => {
    void useSession.getState().loadUsers();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.white },
          }}
        >
          <Stack.Screen name="(tabs)" />
          {/* Opened from the hamburger at the left of every tab-root header. */}
          <Stack.Screen name="menu" />
          {/* The composer slides up over the whole app, like Facebook's. */}
          <Stack.Screen
            name="post/new"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="post/share" />
          {/* Make a Move from the Moves map (ARCHITECTURE.md 7.2). */}
          <Stack.Screen
            name="move/new"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <InAppBanner />
        <SplashOverlay />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
});
