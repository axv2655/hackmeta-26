import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { MarkHeader } from '@/components/marks/MarkHeader';
import { MarkSocial } from '@/components/marks/MarkSocial';
import { Button } from '@/components/ui/Button';
import { ApiError, errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { composerHref } from '@/lib/nav';
import { useSaved } from '@/lib/saved';
import { colors, spacing } from '@/lib/theme';
import type { MarkDetail } from '@/lib/types';

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; error: string }
  | { status: 'ready'; mark: MarkDetail };

function useMark(id: string) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState({ status: 'loading' });
      try {
        const mark = await endpoints.marks.get(id);
        setState({ status: 'ready', mark });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setState({ status: 'missing' });
        else if (!quiet) setState({ status: 'error', error: errorMessage(e) });
      }
    },
    [id],
  );
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);
  useEffect(() => {
    void load();
  }, [load]);
  return { state, load, refresh, refreshing };
}

function MarkBody({ mark, refreshing, onRefresh }: { mark: MarkDetail; refreshing: boolean; onRefresh: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loaded = useSaved((s) => s.loaded);
  const savedInStore = useSaved((s) => Boolean(s.ids[mark.id]));
  const saved = loaded ? savedInStore : mark.saved;

  useEffect(() => {
    if (!useSaved.getState().loaded) void useSaved.getState().load();
  }, []);

  const toggleSave = async () => {
    // The store decides save vs unsave from its own ids, so make sure they are in.
    if (!useSaved.getState().loaded) await useSaved.getState().load();
    await useSaved.getState().toggle(mark.id);
  };
  const startMove = () => router.push(composerHref({ mark_id: mark.id, category: mark.category, origin: 'map' }));
  const openLeaderboard = () => router.push(`/leaderboards?category=${encodeURIComponent(mark.category)}`);

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <MarkHeader mark={mark} saved={saved} onToggleSave={() => void toggleSave()} />
      <View style={styles.actions}>
        <Button title="Start a Move here" icon="plus" size="lg" fullWidth onPress={startMove} />
        <Button title="Leaderboard" icon="star" variant="secondary" fullWidth onPress={openLeaderboard} />
      </View>
      <MarkSocial mark={mark} />
    </ScrollView>
  );
}

/** A Mark (a place): photo, scores, Save, who was here, Moments, and "Start a Move here". */
export default function MarkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const markId = Array.isArray(id) ? id[0] : (id ?? '');
  const { state, load, refresh, refreshing } = useMark(markId);
  const title = state.status === 'ready' ? state.mark.name : 'Place';

  return (
    <StackScreen title={title}>
      {state.status === 'loading' ? <LoadingState label="Loading place" variant="detail" /> : null}
      {state.status === 'error' ? <ErrorState message={state.error} onRetry={() => void load()} /> : null}
      {state.status === 'missing' ? (
        <EmptyState icon="map-pin" title="This place isn't available" body="It may have been removed." />
      ) : null}
      {state.status === 'ready' ? (
        <MarkBody mark={state.mark} refreshing={refreshing} onRefresh={() => void refresh()} />
      ) : null}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  actions: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    marginBottom: spacing.lg,
  },
});
