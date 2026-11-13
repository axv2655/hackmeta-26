import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { colors } from '@/lib/theme';

export type StackScreenProps = {
  title: string;
  /** Right side of the header (a text button or icon). */
  right?: ReactNode;
  children?: ReactNode;
  /** Wrap children in a ScrollView. Leave false when the screen renders its own list. */
  scroll?: boolean;
  /** Back chevron handler. Default: `router.back()`, or `router.replace('/')` with no history. */
  onBack?: () => void;
};

/** A pushed screen: compact header with a back chevron over a white, safe-area page. */
export function StackScreen({ title, right, children, scroll = false, onBack }: StackScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.page}>
      <ScreenHeader variant="compact" title={title} right={right} onBack={onBack} />
      {scroll ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, { paddingBottom: insets.bottom }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1 },
});

export default StackScreen;
