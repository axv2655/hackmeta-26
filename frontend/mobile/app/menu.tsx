import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccordionSection } from '@/components/fb/menu/AccordionSection';
import { ALSO_FROM_META_ID, menuSections, ROW_HREFS } from '@/components/fb/menu/data';
import { LogoutDialog } from '@/components/fb/menu/LogoutDialog';
import { ProfileCard } from '@/components/fb/menu/ProfileCard';
import { ShortcutGrid } from '@/components/fb/menu/ShortcutGrid';
import { MetaLogo } from '@/components/fb/brand/MetaLogo';
import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { ComingSoonSheet } from '@/components/shell/ComingSoonSheet';
import type { IconName } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { DEMO } from '@/lib/demo';
import { useFriends } from '@/lib/friends';
import { warning } from '@/lib/haptics';
import { logoutRow, type MenuRow, type MenuShortcut } from '@/lib/mock';
import { useMeUser } from '@/lib/people';
import { unregisterPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { colors, layout, spacing } from '@/lib/theme';

type Soon = { label: string; icon: IconName } | null;

const TAB_ROUTES = new Set(['/', '/moves', '/reels', '/notifications', '/profile', '/search']);

function requestsBadge(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count === 1 ? '1 request' : `${count} requests`;
}

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMeUser();
  const [logoutVisible, setLogoutVisible] = useState(false);
  const [soon, setSoon] = useState<Soon>(null);
  const incoming = useFriends((s) => s.incoming.length);

  useEffect(() => {
    void useFriends.getState().load();
  }, []);

  // Tabs are switched to (no stacking); everything else is pushed over the Menu.
  const go = useCallback(
    (href: string) => (TAB_ROUTES.has(href) ? router.navigate(href as Href) : router.push(href as Href)),
    [router],
  );

  // Tiles with a screen open it; the Facebook filler says "Coming soon".
  const openShortcut = useCallback(
    (shortcut: MenuShortcut) => {
      if (shortcut.href) go(shortcut.href);
      else setSoon({ label: shortcut.label, icon: shortcut.icon });
    },
    [go],
  );

  const openRow = useCallback(
    (row: MenuRow) => {
      const href = ROW_HREFS[row.id];
      if (href) go(href);
      else setSoon({ label: row.label, icon: row.icon });
    },
    [go],
  );

  const askLogout = useCallback(() => {
    warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  // Forget this phone's account. Every store resets itself through onLogout
  // (lib/session.ts); the root layout then shows the login screen.
  const logOut = useCallback(() => {
    setLogoutVisible(false);
    unregisterPush(); // still signed in here, so the DELETE carries the user
    useSession.getState().logOut();
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const headerActions: HeaderAction[] = [
    { icon: 'settings', accessibilityLabel: 'Settings', onPress: () => go('/settings') },
    { icon: 'search', accessibilityLabel: 'Search', onPress: () => router.navigate('/search') },
  ];

  return (
    <View style={styles.root}>
      {/* Pushed screen: back chevron + large title, no hamburger. */}
      <ScreenHeader
        title="Menu"
        showMenu={false}
        left={
          <IconButton
            name="chevron-left"
            size={28}
            accessibilityLabel="Back"
            onPress={goBack}
            style={styles.back}
          />
        }
        actions={headerActions}
        backgroundColor={colors.surface}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileCard user={me} onPress={() => router.navigate('/profile')} />

        <ShortcutGrid
          onPressShortcut={openShortcut}
          badges={{ 'shortcut-friends': requestsBadge(incoming) }}
          showDemo={DEMO}
        />

        {/* "Hey Meta, start a Move": the voice screen for phone mic or paired glasses. */}
        <Button
          title="Start a Move with your voice"
          icon="mic"
          variant="tinted"
          size="lg"
          onPress={() => router.navigate('/glasses')}
          accessibilityLabel="Start a Move with your voice or glasses"
        />

        <View style={styles.sections}>
          {menuSections.map((row) => (
            <AccordionSection
              key={row.id}
              row={row}
              onPressItem={openRow}
              leading={
                row.id === ALSO_FROM_META_ID ? (
                  <MetaLogo symbolOnly height={17} color={colors.textSecondary} />
                ) : undefined
              }
            />
          ))}
        </View>

        <Button
          title={logoutRow.label}
          variant="secondary"
          size="lg"
          haptic={false}
          onPress={askLogout}
          style={styles.logout}
        />
      </ScrollView>

      <LogoutDialog visible={logoutVisible} onCancel={closeLogout} onConfirm={logOut} />
      <ComingSoonSheet feature={soon} onClose={() => setSoon(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  // Lines the chevron glyph up with the 12pt page gutter.
  back: { marginLeft: -spacing.sm },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  sections: { marginTop: spacing.xs },
  logout: { marginTop: spacing.xs },
});
