import { useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { CircleRow } from '@/components/circles/CircleRow';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { Button } from '@/components/ui/Button';
import { useCircles } from '@/lib/circles';
import { colors, hairline, spacing, type as typeScale } from '@/lib/theme';
import { Appear } from '@/components/common/Appear';

const NEW: Href = '/circles/new';

/** Your Circles: who sees your Moves, in one tap. */
export default function CirclesScreen() {
  const router = useRouter();
  const items = useCircles((s) => s.items);
  const status = useCircles((s) => s.status);
  const error = useCircles((s) => s.error);
  const load = useCircles((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const body = () => {
    if (status === 'error' && !items.length) return <ErrorState message={error ?? 'Could not load your Circles'} onRetry={load} />;
    if ((status === 'idle' || status === 'loading') && !items.length) return <LoadingState label="Loading your Circles" />;
    return (
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.intro}>Pick a Circle when you post a Move and only those people see it.</Text>
            <Button title="New Circle" icon="plus" onPress={() => router.push(NEW)} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title="No Circles yet"
            body="Circles decide who sees your Moves. Make one for roommates, HS friends, your climbing group."
          />
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item, index }) => (
          <Appear index={index}>
          <CircleRow
            circle={item}
            onPress={() => {
              if (!item.id.startsWith('tmp_')) router.push(`/circles/${encodeURIComponent(item.id)}` as Href);
            }}
          />
          </Appear>
        )}
      />
    );
  };

  return <StackScreen title="Circles">{body()}</StackScreen>;
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxxl, flexGrow: 1 },
  header: { padding: spacing.lg, gap: spacing.md },
  intro: { ...typeScale.rowSub, color: colors.textSecondary },
  sep: { marginLeft: 76, ...hairline('Bottom') },
});
