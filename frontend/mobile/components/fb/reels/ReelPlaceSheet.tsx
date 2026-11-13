import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';

import { ErrorState } from '@/components/common/ErrorState';
import { useTabBarHeight } from '@/components/fb/TabBar';
import type { FeedReel } from '@/lib/reels';
import { colors, spacing, type as typeScale } from '@/lib/theme';

import { ActiveMoveState, PlaceHeader, StartMoveState } from './ReelPlaceContent';
import { usePlace } from './usePlace';

export type ReelPlaceSheetProps = {
  /** The reel whose place is open, or null when the sheet is closed. */
  reel: FeedReel | null;
  onClose: () => void;
};

function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />;
}

/**
 * The sheet a Reel's place chip opens (`GET /reels/{id}/place`). With a live
 * Move there: who is there and "I'm going". Otherwise: Muse's draft and
 * "Start a Move here", which opens the composer (nothing posts on its own).
 */
export function ReelPlaceSheet({ reel, onClose }: ReelPlaceSheetProps) {
  const ref = useRef<BottomSheet>(null);
  const tabBarHeight = useTabBarHeight();
  const snapPoints = useMemo(() => ['62%'], []);
  const { state, reload } = usePlace(reel?.id ?? null);

  useEffect(() => {
    if (reel) ref.current?.snapToIndex(0);
    else ref.current?.close();
  }, [reel]);

  const onChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={Backdrop}
      onChange={onChange}
    >
      <BottomSheetScrollView contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}>
        {state.status === 'loading' || state.status === 'idle' ? (
          <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="Loading place">
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={styles.loadingText}>Checking who&apos;s there</Text>
          </View>
        ) : null}
        {state.status === 'error' ? <ErrorState message={state.error} onRetry={reload} style={styles.error} /> : null}
        {state.status === 'ready' && reel ? (
          <>
            <PlaceHeader place={state.place} onClose={onClose} />
            {state.place.active_move ? (
              <ActiveMoveState place={state.place} move={state.place.active_move} onClose={onClose} />
            ) : (
              <StartMoveState place={state.place} caption={reel.caption} onClose={onClose} />
            )}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xl },
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  loadingText: { ...typeScale.meta },
  error: { flex: 0, paddingVertical: spacing.xl },
});

export default ReelPlaceSheet;
