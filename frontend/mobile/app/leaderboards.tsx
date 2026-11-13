import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { MyRow, SpotRow } from '@/components/ratings/BoardRows';
import { CategoryChips } from '@/components/ratings/CategoryChips';
import { categoryMeta } from '@/lib/categories';
import { parseCategory, useBoard, useLeaderboards, type BoardTab } from '@/lib/ratings';
import { colors, hairlineWidth, layout, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Category, LeaderboardSpot, MyListRow } from '@/lib/types';

const TABS: { key: BoardTab; label: string }[] = [
  { key: 'spots', label: 'Top spots' },
  { key: 'mine', label: 'Your list' },
];

function Segments({ value, onChange }: { value: BoardTab; onChange: (t: BoardTab) => void }) {
  return (
    <View style={styles.segments} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={[styles.segment, on && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function emptyCopy(tab: BoardTab, category?: Category): { title: string; body?: string } {
  if (tab === 'mine') {
    return category
      ? { title: `You haven't ranked any ${categoryMeta(category).label.toLowerCase()} spots`, body: 'Rank a spot after your next Move.' }
      : { title: 'Rank a spot after your next Move', body: 'Your ranked spots show up here, best first.' };
  }
  return category
    ? { title: `No friends have ranked ${categoryMeta(category).label.toLowerCase()} yet`, body: 'Rank a spot after your next Move.' }
    : { title: 'No friends have ranked a spot yet', body: 'Rank a spot after your next Move.' };
}

/** `/leaderboards`: top spots from you and your friends, and your own ranked list. */
export default function LeaderboardsScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<BoardTab>('spots');
  const [category, setCategory] = useState<Category | undefined>(() => parseCategory(params.category));
  const [refreshing, setRefreshing] = useState(false);
  const spots = useBoard('spots', category);
  const mine = useBoard('mine', category);
  const board = tab === 'spots' ? spots : mine;
  const load = useLeaderboards((s) => s.load);

  useEffect(() => {
    const fromParam = parseCategory(params.category);
    if (fromParam) setCategory(fromParam);
  }, [params.category]);

  useEffect(() => {
    if (board.status === 'idle') void load(tab, category);
  }, [board.status, load, tab, category]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(tab, category);
    setRefreshing(false);
  }, [load, tab, category]);

  const openMark = (id: string) => router.push({ pathname: '/mark/[id]', params: { id } });
  const firstLoad = board.rows.length === 0 && (board.status === 'loading' || board.status === 'idle');
  const failed = board.status === 'error' && board.rows.length === 0;
  const empty = copyOrNull(board.status === 'ready' && board.rows.length === 0, tab, category);

  return (
    <StackScreen title="Leaderboards">
      <Segments value={tab} onChange={setTab} />
      <CategoryChips value={category} onChange={setCategory} />
      <View style={styles.divider} />
      {firstLoad && !refreshing ? (
        <LoadingState label="Loading leaderboard" />
      ) : failed ? (
        <ErrorState message={board.error ?? 'Could not load the leaderboard'} onRetry={() => void load(tab, category)} />
      ) : tab === 'spots' ? (
        <FlatList<LeaderboardSpot>
          data={spots.rows}
          keyExtractor={(r) => r.mark.id}
          renderItem={({ item }) => <SpotRow spot={item} onPress={() => openMark(item.mark.id)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={empty ? <EmptyState icon="star" title={empty.title} body={empty.body} /> : null}
          contentContainerStyle={styles.list}
        />
      ) : (
        <FlatList<MyListRow>
          data={mine.rows}
          keyExtractor={(r) => `${r.category}:${r.mark.id}`}
          renderItem={({ item }) => <MyRow row={item} onPress={() => openMark(item.mark.id)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={empty ? <EmptyState icon="star" title={empty.title} body={empty.body} /> : null}
          contentContainerStyle={styles.list}
        />
      )}
    </StackScreen>
  );
}

function copyOrNull(show: boolean, tab: BoardTab, category?: Category) {
  return show ? emptyCopy(tab, category) : null;
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    marginHorizontal: layout.gutter,
    marginTop: spacing.md,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  segment: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.white },
  segmentText: { ...typeScale.label, fontSize: 15, color: colors.textSecondary },
  segmentTextOn: { color: colors.text },
  divider: { height: hairlineWidth, backgroundColor: colors.hairline },
  list: { flexGrow: 1, paddingVertical: spacing.xs },
});
