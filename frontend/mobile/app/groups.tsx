import { useCallback, useEffect } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { CrewCard } from '@/components/circles/CrewCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { useCrews } from '@/lib/crews';
import { composerHref, draftToComposer } from '@/lib/nav';
import type { PseudoGroup } from '@/lib/types';
import { colors, spacing, type as typeScale } from '@/lib/theme';

const INTRO = "Only you see these. Muse infers them from Moves you've been to together.";

/** Your crews: groups Muse inferred from Moves you went to together. */
export default function CrewsScreen() {
  const router = useRouter();
  const items = useCrews((s) => s.items);
  const status = useCrews((s) => s.status);
  const error = useCrews((s) => s.error);
  const reviving = useCrews((s) => s.reviving);
  const load = useCrews((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const revive = useCallback(
    async (id: string) => {
      const draft = await useCrews.getState().revive(id);
      if (draft) router.push(composerHref(draftToComposer(draft, 'revive', id)));
    },
    [router],
  );

  const notify = useCallback(
    (crew: PseudoGroup) =>
      router.push(
        composerHref({ user_ids: crew.members.map((m) => m.id).join(','), origin: 'revive', origin_ref: crew.id }),
      ),
    [router],
  );

  const body = () => {
    if (status === 'error' && !items.length) return <ErrorState message={error ?? 'Could not load your crews'} onRetry={load} />;
    if ((status === 'idle' || status === 'loading') && !items.length) return <LoadingState label="Loading your crews" />;
    return (
      <FlatList
        data={items}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.intro}>{INTRO}</Text>}
        ListEmptyComponent={
          <EmptyState
            icon="sparkles"
            title="Muse learns your crews after a few Moves."
            body="Pull up to Moves with the same friends and they show up here."
          />
        }
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        renderItem={({ item }) => (
          <CrewCard
            crew={item}
            reviving={reviving === item.id}
            busy={reviving !== null}
            onRevive={() => void revive(item.id)}
            onNotify={() => notify(item)}
            onToggleMute={() => void useCrews.getState().setMuted(item.id, !item.muted)}
          />
        )}
      />
    );
  };

  return <StackScreen title="Your crews">{body()}</StackScreen>;
}

const styles = StyleSheet.create({
  list: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxxl, flexGrow: 1 },
  intro: { ...typeScale.rowSub, color: colors.textSecondary, paddingHorizontal: spacing.xs },
});
