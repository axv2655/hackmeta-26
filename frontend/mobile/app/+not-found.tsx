import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { colors, spacing, type as typeScale } from '@/lib/theme';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <ScreenHeader title="Not found" variant="compact" />
      <View style={styles.body}>
        <Text style={styles.title}>This page isn't available</Text>
        <Text style={styles.text}>The link may be broken, or the page may have been removed.</Text>
        <Button title="Go to Home" size="lg" onPress={() => router.replace('/')} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, gap: spacing.sm },
  title: { ...typeScale.sectionTitle, fontSize: 20, lineHeight: 25, textAlign: 'center' },
  text: { ...typeScale.rowSub, textAlign: 'center' },
  button: { alignSelf: 'center', marginTop: spacing.md },
});
