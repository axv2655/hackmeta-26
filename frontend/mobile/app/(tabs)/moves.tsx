import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MovesChipRow, type MovesFilter } from '@/components/fb/moves/MovesChipRow';
import { MovesEmptyState } from '@/components/fb/moves/MovesEmptyState';
import { MovesSectionHeader } from '@/components/fb/moves/MovesSectionHeader';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { colors, spacing } from '@/lib/theme';

// PLACEHOLDER: the real Moves map replaces <MovesEmptyState /> (see ARCHITECTURE.md).
export default function MovesScreen() {
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const [filter, setFilter] = useState<MovesFilter>('For you');

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Moves"
        actions={[
          { icon: 'messenger', variant: 'filled', accessibilityLabel: 'Messenger' },
          { icon: 'search', accessibilityLabel: 'Search', onPress: () => router.navigate('/search') },
          { icon: 'more', variant: 'outline', accessibilityLabel: 'More' },
        ]}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <MovesChipRow selected={filter} onSelect={setFilter} style={styles.chips} />
        <MovesSectionHeader title="Happening now" location="Plano, TX" style={styles.section} />
        <MovesEmptyState onPressShare={() => {}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  // flexGrow lets the empty state center itself in whatever space is left.
  content: { flexGrow: 1 },
  chips: { flexGrow: 0, marginTop: spacing.xs },
  section: { marginTop: spacing.xxl },
});
