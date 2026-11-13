import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { MomentImage } from '@/components/move/MomentImage';
import { MomentViewer } from '@/components/move/MomentViewer';
import { needsMyAnswer, wereHere } from '@/components/move/momentText';
import { useMoments } from '@/components/move/useMoments';
import { useMoveDetail } from '@/lib/moveDetail';
import { useSession } from '@/lib/session';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Moment } from '@/lib/types';
import { Appear } from '@/components/common/Appear';

const COLS = 3;
const GAP = 2;

function Tile({ m, size, myId, onPress }: { m: Moment; size: number; myId: string; onPress: () => void }) {
  const ask = needsMyAnswer(m, myId);
  return (
    <Pressable
      onPress={onPress}
      style={{ width: size, height: size }}
      accessibilityRole="button"
      accessibilityLabel={`${wereHere(m, myId)}${ask ? '. Needs your OK' : ''}`}
    >
      <MomentImage moment={m} style={StyleSheet.absoluteFill} />
      {ask ? (
        <View style={[styles.badge, styles.badgeAsk]}>
          <Text style={styles.badgeText}>Needs your OK</Text>
        </View>
      ) : m.status === 'pending' ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Pending</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** `/move/[id]/moments`: the Move's Moments, with tag approval. */
export default function MomentsScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const moveId = String(raw ?? '');
  const myId = useSession((s) => s.userId);
  const move = useMoveDetail((s) => s.byId[moveId]);
  const { items, status, error, load, approve } = useMoments(moveId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GAP * (COLS - 1)) / COLS);

  useEffect(() => {
    if (moveId && !useMoveDetail.getState().byId[moveId]) void useMoveDetail.getState().load(moveId);
  }, [moveId]);

  const open = items.find((m) => m.id === openId) ?? null;
  const waiting = items.filter((m) => needsMyAnswer(m, myId)).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  let content;
  if (status === 'loading') content = <LoadingState label="Loading Moments" variant="grid" />;
  else if (status === 'error') content = <ErrorState message={error ?? 'Could not load Moments'} onRetry={() => void load()} />;
  else {
    content = (
      <FlatList
        data={items}
        keyExtractor={(m) => m.id}
        numColumns={COLS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : { gap: GAP }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {move ? (
              <Text style={typeScale.rowSub} numberOfLines={2}>
                {move.text} · {move.mark.name}
              </Text>
            ) : null}
            {waiting > 0 ? (
              <Text style={styles.waiting}>
                {waiting} {waiting === 1 ? 'Moment needs' : 'Moments need'} your OK. Tap to review.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="images"
            title="No Moments yet"
            body="Photos people add at this Move show up here once everyone tagged says OK."
          />
        }
        renderItem={({ item, index }) => <Appear index={index}><Tile m={item} size={size} myId={myId} onPress={() => setOpenId(item.id)} /></Appear>}
      />
    );
  }

  return (
    <StackScreen title="Moments">
      {content}
      <MomentViewer
        moment={open}
        myId={myId}
        onClose={() => setOpenId(null)}
        onAnswer={(momentId, yes) => void approve(momentId, myId, yes)}
      />
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.xs },
  waiting: { ...typeScale.label, color: colors.blue },
  emptyWrap: { flexGrow: 1 },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: colors.scrim,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeAsk: { backgroundColor: colors.blue },
  badgeText: { ...typeScale.label, fontSize: 11, color: colors.white },
});
