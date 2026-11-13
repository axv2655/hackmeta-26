import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccordionSection } from '@/components/fb/menu/AccordionSection';
import { ALSO_FROM_META_ID, menuSections } from '@/components/fb/menu/data';
import { LogoutDialog } from '@/components/fb/menu/LogoutDialog';
import { ProfileCard } from '@/components/fb/menu/ProfileCard';
import { ShortcutGrid } from '@/components/fb/menu/ShortcutGrid';
import { MetaLogo } from '@/components/fb/brand/MetaLogo';
import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { warning } from '@/lib/haptics';
import { useLive } from '@/lib/live';
import { unregisterPush } from '@/lib/push';
import { currentUser, logoutRow, type MenuShortcut } from '@/lib/mock';
import { useSession } from '@/lib/session';
import { useInbox } from '@/lib/store/inbox';
import { useMyMoves } from '@/lib/store/moves';
import { colors, layout, spacing } from '@/lib/theme';

export default function MenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [logoutVisible, setLogoutVisible] = useState(false);

  const openShortcut = useCallback(
    (shortcut: MenuShortcut) => {
      // Only shortcuts that map to a real tab go anywhere; the rest are mock tiles.
      if (shortcut.href) router.navigate(shortcut.href);
    },
    [router],
  );

  const askLogout = useCallback(() => {
    warning();
    setLogoutVisible(true);
  }, []);

  const closeLogout = useCallback(() => setLogoutVisible(false), []);

  // Forget this phone's account and everything loaded for it; the root
  // layout then shows the login screen.
  const logOut = useCallback(() => {
    setLogoutVisible(false);
    unregisterPush(); // still signed in here, so the DELETE carries the user
    useMyMoves.setState({ mine: [], focusId: null });
    useInbox.setState({ items: [], banner: null });
    useLive.setState({ moves: null, online: false });
    useSession.getState().logOut();
  }, []);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const headerActions: HeaderAction[] = [
    { icon: 'settings', accessibilityLabel: 'Settings' },
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
        <ProfileCard user={currentUser} onPress={() => router.navigate('/profile')} />

        <ShortcutGrid onPressShortcut={openShortcut} />

        <View style={styles.sections}>
          {menuSections.map((row) => (
            <AccordionSection
              key={row.id}
              row={row}
              leading={
                row.id === ALSO_FROM_META_ID ? (
                  <MetaLogo symbolOnly height={17} color={colors.textSecondary} />
                ) : undefined
              }
            />
          ))}
        </View>

        {/* Mock only: confirming just closes the dialog. */}
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
