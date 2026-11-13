import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { useHomeFeed, usePullUp } from '@/lib/homeFeed';
import { useMe } from '@/lib/session';
import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Move } from '@/lib/types';

import { MOVE_CARD_WIDTH, MoveFeedCard } from './MoveFeedCard';

const CARD_GAP = spacing.sm;
/** Flare countdowns refresh this often. */
const TICK_MS = 30_000;

/** Re-render every `TICK_MS` while any Flare is counting down. */
function useCountdownTick(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [active]);
}

function Header({ onSeeMap }: { onSeeMap: () => void }) {
  return (
    <View style={styles.header}>
      <Icon name="moves" size={20} color={colors.blue} filled />
      <Text style={styles.title} accessibilityRole="header">
        Moves from friends
      </Text>
      <PressableScale onPress={onSeeMap} scaleTo={1} pressedOpacity={0.5} hitSlop={8} accessibilityRole="link">
        <Text style={styles.link}>See map</Text>
      </PressableScale>
    </View>
  );
}

function Skeleton() {
  return (
    <View style={styles.strip} accessibilityRole="progressbar" accessibilityLabel="Loading Moves">
      {[0, 1].map((i) => (
        <View key={i} style={styles.skeleton}>
          <View style={styles.skelHead} />
          <View style={[styles.skelLine, { width: '90%' }]} />
          <View style={[styles.skelLine, { width: '60%' }]} />
          <ActivityIndicator color={colors.textSecondary} style={styles.skelSpinner} />
        </View>
      ))}
    </View>
  );
}

function Message({ text, action }: { text: string; action: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageText}>{text}</Text>
      <Button title={action.label} variant="tinted" size="sm" onPress={action.onPress} />
    </View>
  );
}

/** Home's live unit: Muse-ranked Moves from friends with one-tap Pull up. */
export function MovesFeedUnit() {
  const router = useRouter();
  const me = useMe();
  const moves = useHomeFeed((s) => s.moves);
  const status = useHomeFeed((s) => s.status);
  const error = useHomeFeed((s) => s.error);
  const busy = useHomeFeed((s) => s.busy);
  const load = useHomeFeed((s) => s.load);
  const pullUp = usePullUp();

  useEffect(() => {
    void load();
  }, [load]);
  useCountdownTick(moves.some((m) => m.kind === 'flare' && m.fill_deadline));

  const open = useCallback((move: Move) => router.push(`/move/${encodeURIComponent(move.id)}`), [router]);
  const onPullUp = useCallback((move: Move) => void pullUp(move.id), [pullUp]);
  const makeMove = useCallback(() => router.push('/move/new'), [router]);
  const seeMap = useCallback(() => router.navigate('/moves'), [router]);

  let body;
  if (moves.length > 0) {
    body = (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={MOVE_CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.strip}
      >
        {moves.map((move) => (
          <MoveFeedCard
            key={move.id}
            move={move}
            meId={me?.id ?? null}
            busy={Boolean(busy[move.id])}
            onOpen={open}
            onPullUp={onPullUp}
          />
        ))}
      </ScrollView>
    );
  } else if (status === 'error') {
    body = <Message text={error ?? "Couldn't load Moves"} action={{ label: 'Retry', onPress: () => void load() }} />;
  } else if (status === 'ready') {
    body = <Message text="Nobody's out yet." action={{ label: 'Make a Move', onPress: makeMove }} />;
  } else {
    body = <Skeleton />;
  }

  return (
    <View style={styles.root}>
      <Header onSeeMap={seeMap} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, paddingBottom: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: layout.gutter,
  },
  title: { ...typeScale.sectionTitle, fontWeight: fontWeights.bold, letterSpacing: -0.3, flex: 1 },
  link: { ...typeScale.button, color: colors.blue },
  strip: { flexDirection: 'row', paddingHorizontal: layout.gutter, gap: CARD_GAP },
  skeleton: {
    width: MOVE_CARD_WIDTH,
    height: 180,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  skelHead: { width: 120, height: 14, borderRadius: 7, backgroundColor: colors.band },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: colors.band },
  skelSpinner: { marginTop: spacing.lg },
  message: {
    marginHorizontal: layout.gutter,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  messageText: { ...typeScale.rowSub, textAlign: 'center' },
});

export default MovesFeedUnit;
