import { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { MoveCard } from '@/components/fb/moves/MoveCard';
import { MoveRow } from '@/components/fb/moves/MoveRow';
import { MovesEmptyState } from '@/components/fb/moves/MovesEmptyState';
import { MuseSearchBox } from '@/components/muse/MuseSearchBox';
import { MuseSearchPanel } from '@/components/muse/MuseSearchPanel';
import { PressableScale } from '@/components/ui/PressableScale';
import { success } from '@/lib/haptics';
import { moveMeta } from '@/lib/live';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import type { MapMove } from '@/lib/mock/moves';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';

import { ForYouStrip } from './ForYouStrip';
import { MuseSuggestionCard } from './MuseSuggestionCard';
import { BitmojiFace, SheetGlassBackground, SheetHandle, useSheetBottomInset } from './SheetParts';

export const SHEET_COLLAPSED = 84;
/** Height of SheetHandle (7 top + 5 bar + 5 bottom). */
const HANDLE_HEIGHT = 17;
const SHEET_SIDE_INSET = 8;

export type MovesSheetProps = {
  moves: MapMove[];
  selected: MapMove | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  animatedIndex: SharedValue<number>;
  onIndexChange?: (index: number) => void;
  /** Pull up / take it back (the parent talks to the backend). */
  onPull: (id: string) => void;
  /** Load state of the Moves world (lib/live). */
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** The bundled sample world is showing. */
  sample: boolean;
  onRetry: () => void;
};

export { useSheetBottomInset };

/**
 * Apple-Maps-style floating glass sheet that lives inside the Moves tab (not a
 * modal), so the map stays live under it and the tab bar stays on top.
 * Detents: Muse prompt box, half (Muse's answer, Muse card, For you, out now +
 * list), and full.
 * Selecting a friend swaps the content to their Move card in place.
 */
export const MovesSheet = forwardRef<BottomSheet, MovesSheetProps>(function MovesSheet(
  { moves, selected, onSelect, onClose, animatedIndex, onIndexChange, onPull, status, error, sample, onRetry },
  ref,
) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomInset = useSheetBottomInset();
  const me = useSession((s) => s.userId);

  const fullHeight = height - insets.top - 8 - bottomInset;
  const snapPoints = useMemo(() => [SHEET_COLLAPSED, '48%', fullHeight], [fullHeight]);

  // gorhom keeps the content at full height and slides it; with a detached
  // sheet floating above the tab bar the off-sheet part would show through
  // below it, so clip the content to the sheet's visible height.
  const animatedPosition = useSharedValue(height);
  const clipStyle = useAnimatedStyle(() => ({
    height: Math.max(0, height - bottomInset - animatedPosition.value - HANDLE_HEIGHT),
  }));

  const togglePull = (move: MapMove) => {
    if (!move.going) success();
    onPull(move.id);
  };

  return (
    <BottomSheet
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      detached
      bottomInset={bottomInset}
      style={styles.sheet}
      animatedIndex={animatedIndex}
      animatedPosition={animatedPosition}
      onChange={onIndexChange}
      backgroundComponent={SheetGlassBackground}
      handleComponent={SheetHandle}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      enablePanDownToClose={false}
    >
      <Animated.View style={[styles.clip, clipStyle]}>
        {selected ? (
          <MoveCard move={selected} sample={sample} onPull={() => togglePull(selected)} onClose={onClose} />
        ) : (
          <>
            <View style={styles.header}>
              <MuseSearchBox />
              <View style={styles.meFace}>
                <Image source={bitmojiFor(me, 'selfie')} style={styles.meImage} contentFit="cover" />
              </View>
            </View>

            <BottomSheetScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <MuseSearchPanel />
              <SheetList
                moves={moves}
                status={status}
                error={error}
                onRetry={onRetry}
                onSelect={onSelect}
                onPull={togglePull}
              />
            </BottomSheetScrollView>
          </>
        )}
      </Animated.View>
    </BottomSheet>
  );
});

type SheetListProps = {
  moves: MapMove[];
  status: MovesSheetProps['status'];
  error: string | null;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onPull: (move: MapMove) => void;
};

/** The list half of the sheet: Muse card, For you, out now, then every Move. */
function SheetList({ moves, status, error, onRetry, onSelect, onPull }: SheetListProps) {
  const router = useRouter();
  const live = moves.filter((m) => m.status !== 'ghost');
  const ghosts = moves.filter((m) => m.status === 'ghost');

  if (moves.length === 0 && (status === 'loading' || status === 'idle')) {
    return <LoadingState label="Loading Moves" style={styles.stateBox} />;
  }
  if (moves.length === 0 && status === 'error') {
    return <ErrorState message={error ?? "Couldn't load Moves"} onRetry={onRetry} style={styles.stateBox} />;
  }

  return (
    <>
      <MuseSuggestionCard />
      {live.length === 0 ? (
        <MovesEmptyState art={150} style={styles.emptyArt} onPressMake={() => router.push('/move/new')} />
      ) : null}
      <ForYouStrip moves={live} onSelect={onSelect} />
      {live.length > 0 ? <OutNow moves={live} onSelect={onSelect} /> : null}

      {live.length > 0 ? <Text style={styles.sectionTitle}>Happening now</Text> : null}
      {live.length > 0 ? (
        <View style={styles.group}>
          {live.map((m, i) => (
            <MoveRow
              key={m.id}
              move={m}
              first={i === 0}
              onPress={() => onSelect(m.id)}
              onPull={m.mine ? undefined : () => onPull(m)}
            />
          ))}
        </View>
      ) : null}

      {ghosts.length > 0 ? <Text style={styles.sectionTitle}>Earlier</Text> : null}
      {ghosts.length > 0 ? (
        <View style={styles.group}>
          {ghosts.map((m, i) => (
            <MoveRow key={m.id} move={m} first={i === 0} onPress={() => onSelect(m.id)} />
          ))}
        </View>
      ) : null}
    </>
  );
}

function OutNow({ moves, onSelect }: { moves: MapMove[]; onSelect: (id: string) => void }) {
  return (
    <>
      <Text style={styles.sectionTitle}>Out now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outRow}>
        {moves.map((m) => (
          <PressableScale key={m.id} onPress={() => onSelect(m.id)} style={styles.outItem} scaleTo={0.94}>
            <BitmojiFace userId={m.user.id} size={64} color={moveMeta(m).color} />
            <Text style={styles.outName} numberOfLines={1}>
              {m.mine ? 'You' : m.user.firstName}
            </Text>
            <Text style={styles.outMeta} numberOfLines={1}>
              {moveMeta(m).label}
            </Text>
          </PressableScale>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { marginHorizontal: SHEET_SIDE_INSET },
  clip: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  meFace: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF3FF',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.white,
  },
  meImage: { width: '100%', height: '100%' },
  scrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  outRow: { gap: 14, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  outItem: { alignItems: 'center', width: 70 },
  outName: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  outMeta: { fontSize: 12, color: colors.textSecondary },
  group: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.62)',
    overflow: 'hidden',
  },
  emptyArt: { flex: 0, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  stateBox: { flex: 0, paddingVertical: spacing.xxl },
});

export default MovesSheet;
