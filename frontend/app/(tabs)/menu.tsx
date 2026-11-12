import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AccordionSection } from '@/components/fb/menu/AccordionSection';
import { ALSO_FROM_META_ID, menuSections } from '@/components/fb/menu/data';
import { LogoutDialog } from '@/components/fb/menu/LogoutDialog';
import { ProfileCard } from '@/components/fb/menu/ProfileCard';
import { ShortcutGrid } from '@/components/fb/menu/ShortcutGrid';
import { MetaLogo } from '@/components/fb/brand/MetaLogo';
import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { warning } from '@/lib/haptics';
import { currentUser, logoutRow, type MenuShortcut } from '@/lib/mock';
import { colors, layout, spacing } from '@/lib/theme';

const HEADER_ACTIONS: HeaderAction[] = [
  { icon: 'settings', accessibilityLabel: 'Settings', background: true },
  { icon: 'search', accessibilityLabel: 'Search', background: true },
];

export default function MenuScreen() {
  const router = useRouter();
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

  return (
    <View style={styles.root}>
      <ScreenHeader title="Menu" actions={HEADER_ACTIONS} backgroundColor={colors.surface} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
        <Button title={logoutRow.label} variant="secondary" size="lg" haptic={false} onPress={askLogout} />
      </ScrollView>

      <LogoutDialog visible={logoutVisible} onCancel={closeLogout} onConfirm={closeLogout} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sections: { marginTop: spacing.xs },
});
