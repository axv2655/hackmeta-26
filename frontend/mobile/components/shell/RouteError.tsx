import { StyleSheet, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, type as typeScale } from '@/lib/theme';

/**
 * expo-router `ErrorBoundary` for layouts: a render error in a screen shows
 * this instead of a red screen, with a retry that re-mounts the route.
 */
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  if (__DEV__) console.warn('Route render error', error);
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Icon name="info" size={36} color={colors.textSecondary} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>This screen hit a problem. Try again, or go back.</Text>
      <Button title="Try again" size="lg" onPress={() => void retry()} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  title: { ...typeScale.sectionTitle, fontSize: 20, lineHeight: 25, textAlign: 'center' },
  body: { ...typeScale.rowSub, textAlign: 'center' },
  button: { alignSelf: 'center', marginTop: spacing.md },
});

export default RouteError;
