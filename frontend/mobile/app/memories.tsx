import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { OfflineBar } from '@/components/common/OfflineBar';
import { StackScreen } from '@/components/common/StackScreen';
import { Button } from '@/components/ui/Button';
import { MetaShortcutIcon } from '@/components/ui/MetaShortcutIcon';
import { useMemories } from '@/lib/memories';
import { colors, radius, spacing } from '@/lib/theme';

export default function MemoriesScreen() {
  const router = useRouter();
  const { items, status, error, hasMore, load } = useMemories();
  useFocusEffect(useCallback(() => {
    void load();
    // A visit can pass its 24-hour boundary while this screen stays open.
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
          <Text style={styles.sub}>Ghosts stay on the map for a day. Your visits live here after 24 hours, with their Moments.</Text>
          <Text style={styles.sub}>Only you can see this collection. Moments keep their original audience.</Text>
        </View>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {status === 'loading' && !items.length ? <LoadingState label="Loading Memories" /> : null}
        {status === 'ready' && !items.length ? <EmptyState icon="history" title="Memories are on their way"
          body="After you leave a Move or it ends, your visit appears here a day later." /> : null}
        {items.map((memory) => (
          <View key={memory.move_id} style={styles.card}>
            <Text style={styles.sub}>{new Date(memory.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
            <Text style={styles.heading}>{memory.mark_name}</Text>
            <Text style={styles.text}>{memory.text}</Text>
            <Button title="See Moments" icon="images" variant="tinted"
              onPress={() => router.push(`/move/${encodeURIComponent(memory.move_id)}/moments`)} />
            <Button title="View place" icon="map-pin" variant="secondary"
              onPress={() => router.push(`/mark/${encodeURIComponent(memory.mark_id)}`)} />
          </View>
        ))}
        {hasMore ? <Button title={status === 'loading' ? 'Loading...' : 'Older Memories'} disabled={status === 'loading'}
          onPress={() => void load(true)} variant="tinted" /> : null}
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { gap: spacing.sm, paddingBottom: spacing.md },
  card: { padding: spacing.lg, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  text: { fontSize: 16, color: colors.text },
  sub: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
});
