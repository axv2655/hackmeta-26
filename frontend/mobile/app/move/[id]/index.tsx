import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { AudienceCard } from '@/components/move/AudienceCard';
import { MomentsRow } from '@/components/move/MomentsRow';
import { MoveActions } from '@/components/move/MoveActions';
import { MoveHeader } from '@/components/move/MoveHeader';
import { Participants } from '@/components/move/Participants';
import { PlaceRow } from '@/components/move/PlaceRow';
import { useMoveDetail } from '@/lib/moveDetail';
import { useSaved } from '@/lib/saved';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';
import type { Move } from '@/lib/types';
import { Appear } from '@/components/common/Appear';

function Body({ move, myId }: { move: Move; myId: string }) {
  const mine = move.creator.id === myId;
  return (
    <View style={styles.body}>
      <MoveHeader move={move} />
      <PlaceRow mark={move.mark} />
      <MoveActions move={move} />
      {mine && move.audience ? <AudienceCard moveId={move.id} audience={move.audience} /> : null}
      <View style={styles.band} />
      <Participants participants={move.participants} myId={myId} />
      <MomentsRow move={move} />
    </View>
  );
}

/** `/move/[id]`: one Move with everything you can do with it. */
export default function MoveDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = String(raw ?? '');
  const router = useRouter();
  const myId = useSession((s) => s.userId);
  const move = useMoveDetail((s) => s.byId[id]);
  const status = useMoveDetail((s) => s.status[id]);
  const error = useMoveDetail((s) => s.error[id]);
  const load = useMoveDetail((s) => s.load);
  const savedLoaded = useSaved((s) => s.loaded);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (id) void load(id);
  }, [id, load]);

  useEffect(() => {
    if (!savedLoaded) void useSaved.getState().load();
  }, [savedLoaded]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(id);
    setRefreshing(false);
  }, [id, load]);

  let content;
  if (move) {
    content = (
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <Appear>
          <Body move={move} myId={myId} />
        </Appear>
      </ScrollView>
    );
  } else if (status === 'missing' || !id) {
    content = (
      <EmptyState
        icon="eye-off"
        title="This Move is gone or not shared with you"
        action={{ label: 'See Moves', onPress: () => router.replace('/moves') }}
      />
    );
  } else if (status === 'error') {
    content = <ErrorState message={error ?? 'Could not load this Move'} onRetry={() => void load(id)} />;
  } else {
    content = <LoadingState label="Loading Move" variant="detail" />;
  }

  return (
    <StackScreen title="Move">
      {content}
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: spacing.xxxl },
  body: { gap: spacing.lg },
  band: { height: 6, backgroundColor: colors.band },
});
