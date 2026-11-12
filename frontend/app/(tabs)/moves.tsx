import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MovesMap, type MovesMapHandle } from '@/components/moves/MovesMap';
import { MovesSheet, SHEET_COLLAPSED, useSheetBottomInset } from '@/components/moves/MovesSheet';
import { GlassSurface } from '@/components/ui/Glass';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection, tap } from '@/lib/haptics';
import { getMapMove, mapMoves } from '@/lib/mock/moves';
import { colors } from '@/lib/theme';

/**
 * Moves tab: a full-screen Snap-Map-style map of friends' Moves with an
 * Apple-Maps-style floating glass sheet. Drag the sheet up for the list of
 * what friends are doing; tap a Bitmoji (on the map or in the list) to open
 * their Move card in the same sheet.
 */
export default function MovesScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetBottomInset = useSheetBottomInset();
  const mapRef = useRef<MovesMapHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const sheetIndex = useSharedValue(0);
  const [settledIndex, setSettledIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = selectedId ? getMapMove(selectedId) ?? null : null;

  const select = useCallback((id: string) => {
    const move = getMapMove(id);
    if (!move) return;
    tap();
    setSelectedId(id);
    sheetRef.current?.snapToIndex(1);
    mapRef.current?.focus(move.mark.coordinate);
  }, []);

  const clear = useCallback(() => {
    setSelectedId((current) => {
      if (current) sheetRef.current?.snapToIndex(0);
      return null;
    });
  }, []);

  const visibleSheet = settledIndex >= 1 ? height * 0.48 : SHEET_COLLAPSED;

  // Floating map controls slide up out of the way when the sheet goes full height.
  const controlsStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(sheetIndex.value, [1, 2], [0, -(insets.top + 140)], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={styles.root}>
      <MovesMap
        ref={mapRef}
        moves={mapMoves}
        selectedId={selectedId}
        onSelect={select}
        onClear={clear}
        topPadding={insets.top + 40}
        bottomPadding={visibleSheet + sheetBottomInset}
      />

      <Animated.View pointerEvents="box-none" style={[styles.top, { top: insets.top + 6 }, controlsStyle]}>
        <GlassSurface radius={22} style={styles.titlePill}>
          <Text style={styles.title}>Richardson</Text>
          <Text style={styles.subtitle}>{mapMoves.filter((m) => m.status !== 'ghost').length} friends out · 73°</Text>
        </GlassSurface>

        <GlassSurface radius={26} style={styles.controls}>
          <PressableScale
            accessibilityLabel="Map style"
            onPress={() => selection()}
            style={styles.controlButton}
            scaleTo={0.9}
          >
            <Icon name="map" size={22} color={colors.text} />
          </PressableScale>
          <View style={styles.controlDivider} />
          <PressableScale
            accessibilityLabel="Center on me"
            onPress={() => {
              clear();
              mapRef.current?.recenter();
            }}
            style={styles.controlButton}
            scaleTo={0.9}
          >
            <Icon name="navigation" size={21} color={colors.blue} />
          </PressableScale>
        </GlassSurface>
      </Animated.View>

      <MovesSheet
        ref={sheetRef}
        moves={mapMoves}
        selected={selected}
        onSelect={select}
        onClose={clear}
        animatedIndex={sheetIndex}
        onIndexChange={(index) => {
          setSettledIndex(index);
          // A Move card doesn't fit the pill detent: collapsing means "done".
          if (index <= 0) setSelectedId(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  top: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  titlePill: { paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  controls: { width: 52, alignItems: 'center', paddingVertical: 4 },
  controlButton: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { width: 28, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
});
