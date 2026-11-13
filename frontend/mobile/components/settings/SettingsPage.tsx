import { useEffect, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { useSettings } from '@/lib/settings';
import { colors, spacing } from '@/lib/theme';
import type { Me } from '@/lib/types';

/** Gray scrolling page for settings cards, with pull to refresh. */
export function SettingsScroll({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxxl }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

/**
 * A settings screen that needs `GET /me`: loads it, shows the spinner or the
 * error with Retry, then renders `children(me)` on the gray page.
 */
export function SettingsPage({ title, children }: { title: string; children: (me: Me) => ReactNode }) {
  const me = useSettings((s) => s.me);
  const status = useSettings((s) => s.status);
  const error = useSettings((s) => s.error);
  const load = useSettings((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  let body: ReactNode;
  if (me) {
    body = (
      <SettingsScroll refreshing={status === 'loading'} onRefresh={() => void load()}>
        {children(me)}
      </SettingsScroll>
    );
  } else if (status === 'error') {
    body = <ErrorState message={error ?? 'Could not load your settings'} onRetry={() => void load()} />;
  } else {
    body = <LoadingState label="Loading your settings" />;
  }
  return <StackScreen title={title}>{body}</StackScreen>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surface },
});
