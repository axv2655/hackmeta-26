import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { OfflineBar } from '@/components/common/OfflineBar';
import { StackScreen } from '@/components/common/StackScreen';
import { MemoryPost } from '@/components/fb/memories/MemoryPost';
import { Button } from '@/components/ui/Button';
import { MetaShortcutIcon } from '@/components/ui/MetaShortcutIcon';
import { useMemories } from '@/lib/memories';
import { colors, spacing } from '@/lib/theme';

export default function MemoriesScreen() {
  const { items, status, error, hasMore, load } = useMemories();
  useFocusEffect(useCallback(() => {
    void load();
    // Catches anything the socket missed while this screen stays open.
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]));
  return (
    <StackScreen title="Memories">
      <OfflineBar />
      <ScrollView contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={status === 'loading'} onRefresh={() => void load()} />}>
        <View style={styles.intro}>
          <MetaShortcutIcon name="memories" size={36} />
          <Text style={styles.heading}>Your Moves, remembered</Text>
          <Text style={styles.sub}>Every Move you showed up to lands here as soon as you leave, with its Moments. Friends still see your Ghost on the map for a day.</Text>
          <Text style={styles.sub}>Only you can see this collection. Moments keep their original audience.</Text>
        </View>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {status === 'loading' && !items.length ? <LoadingState label="Loading Memories" /> : null}
        {status === 'ready' && !items.length ? <EmptyState icon="history" title="Memories are on their way"
          body="Pull up to a Move. When you leave, or it ends, it shows up here." /> : null}
        {items.map((memory) => <MemoryPost key={memory.move_id} memory={memory} />)}
        {hasMore ? <Button title={status === 'loading' ? 'Loading...' : 'Older Memories'} disabled={status === 'loading'}
          onPress={() => void load(true)} variant="tinted" /> : null}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { gap: spacing.sm, paddingBottom: spacing.md },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  sub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
});
