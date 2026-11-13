import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { MapStatusPills } from '@/components/fb/moves/MapStatusPills';
import { HOME_CAMERA, MovesMap, type MovesMapHandle } from '@/components/moves/MovesMap';
import { MovesSheet, SHEET_COLLAPSED, useSheetBottomInset } from '@/components/moves/MovesSheet';
import { GlassSurface } from '@/components/ui/Glass';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { useCityAt } from '@/lib/city';
import { useLocation } from '@/lib/location';
import { selection, tap } from '@/lib/haptics';
import { useLive } from '@/lib/live';
import type { Coordinate, MapMove } from '@/lib/mock/moves';
import { useSaved } from '@/lib/saved';
import { useMyMoves } from '@/lib/store/moves';
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
  // The header names the city at the center of what you're looking at.
  const [center, setCenter] = useState<Coordinate>(HOME_CAMERA.center);
  const city = useCityAt(center, 'Nearby');

  // First GPS fix: fly to it and reload what's around you.
  const hasFix = useLocation((s) => s.coords !== null);
  useEffect(() => {
    if (!hasFix) return;
    mapRef.current?.recenter();
    void useLive.getState().load();
  }, [hasFix]);
  const router = useRouter();
  // Nothing near the phone: fly to campus, where the Moves are.
  const nearCampusNow = useLive((s) => s.nearCampus);
  useEffect(() => {
    if (nearCampusNow) mapRef.current?.focus(HOME_CAMERA.center, false);
  }, [nearCampusNow]);
  const mine = useMyMoves((s) => s.mine);
  const focusId = useMyMoves((s) => s.focusId);
  const live = useLive((s) => s.moves);
  const status = useLive((s) => s.status);
  const error = useLive((s) => s.error);
  const sample = useLive((s) => s.sample);
  const locationOff = useLocation((s) => s.permission === 'denied');
  // Backend Moves; the sample world only under the mock rule (lib/demo), with
  // Moves posted this session on top of it.
  const moves = useMemo(() => {
    const world = live ?? [];
    if (!sample) return world;
    const ids = new Set(world.map((m) => m.id));
    return [...mine.filter((m) => !ids.has(m.id)), ...world];
  }, [live, sample, mine]);
  const friendsOut = moves.filter((m) => m.status !== 'ghost' && !m.mine).length;

  // Load on focus and keep fresh while the tab is open; realtime events also
  // trigger loads (lib/live subscribes to appEvents).
  useFocusEffect(
    useCallback(() => {
      void useLocation.getState().start(); // asks once, in context
      void useLive.getState().load();
      if (!useSaved.getState().loaded) void useSaved.getState().load();
      const timer = setInterval(() => void useLive.getState().load(), 15000);
      return () => clearInterval(timer);
    }, []),
  );

  // Back from the OS settings: pick up a newly granted location permission.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useLocation.getState().recheck();
    });
    return () => sub.remove();
  }, []);

  const selected = selectedId ? moves.find((m) => m.id === selectedId) ?? null : null;

  const select = useCallback(
    (id: string) => {
      const move = moves.find((m) => m.id === id || m.moveId === id);
      if (!move) return;
      tap();
      setSelectedId(move.id);
      sheetRef.current?.snapToIndex(1);
      mapRef.current?.focus(move.mark.coordinate);
    },
    [moves],
  );

  // Coming back from the composer: open the Move that was just posted. Clear
  // the request only when the timer fires; clearing it first would re-run this
  // effect and cancel the timer. The wait lets the composer finish dismissing.
  // A Move that is not on this map (too far, ended, a ghost elsewhere) opens
  // its own screen instead, once the map has loaded.
  const resolving = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    const matches = (m: MapMove) => m.id === focusId || m.moveId === focusId;
    if (!moves.some(matches)) {
      if (sample || resolving.current === focusId) return;
      resolving.current = focusId;
      // Load once more (it may have just been posted); still missing means open its screen.
      void useLive.getState().load().then(() => {
        resolving.current = null;
        if (useMyMoves.getState().focusId !== focusId) return;
        if ((useLive.getState().moves ?? []).some(matches)) return; // this effect selects it
        useMyMoves.getState().focus(null);
        router.push(`/move/${encodeURIComponent(focusId)}`);
      });
      return;
    }
    const timer = setTimeout(() => {
      useMyMoves.getState().focus(null);
      select(focusId);
    }, 700);
    return () => clearTimeout(timer);
  }, [focusId, moves, select, sample, router]);

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
      { translateY: interpolate(sheetIndex.value, [1, 2], [0, -(insets.top + 200)], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={styles.root}>
      <MovesMap
        ref={mapRef}
        moves={moves}
        selectedId={selectedId}
        onSelect={select}
        onClear={clear}
        onCenterChange={setCenter}
        topPadding={insets.top + 40}
        bottomPadding={visibleSheet + sheetBottomInset}
      />

      <Animated.View pointerEvents="box-none" style={[styles.top, { top: insets.top + 6 }, controlsStyle]}>
        <GlassSurface radius={22} style={styles.titlePill}>
          <Text style={styles.title} numberOfLines={1}>
            {city}
          </Text>
          <Text style={styles.subtitle}>
            {friendsOut === 1 ? '1 friend out' : `${friendsOut} friends out`}
          </Text>
        </GlassSurface>

        <GlassSurface radius={26} style={styles.controls}>
          <PressableScale
            accessibilityLabel="Leaderboards"
            onPress={() => {
              selection();
              router.push('/leaderboards');
            }}
            style={styles.controlButton}
            scaleTo={0.9}
          >
            <Icon name="star" size={22} color={colors.text} />
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
          <View style={styles.controlDivider} />
          {/* Make a Move (ARCHITECTURE.md 7.2): where, what, who; then notify or share. */}
          <PressableScale
            accessibilityLabel="Make a Move"
            onPress={() => {
              selection();
              router.push('/move/new');
            }}
            style={styles.controlButton}
            scaleTo={0.9}
          >
            <Icon name="message-plus" size={22} color={colors.blue} />
          </PressableScale>
        </GlassSurface>
      </Animated.View>

      <Animated.View pointerEvents="box-none" style={[styles.pills, { top: insets.top + 74 }, controlsStyle]}>
        <MapStatusPills
          loading={status === 'loading' && live === null}
          error={status === 'error' ? error : null}
          onRetry={() => void useLive.getState().load()}
          nearCampus={nearCampusNow}
          locationOff={locationOff}
          onOpenSettings={() => void Linking.openSettings()}
        />
      </Animated.View>

      <MovesSheet
        ref={sheetRef}
        moves={moves}
        selected={selected}
        onSelect={select}
        onClose={clear}
        animatedIndex={sheetIndex}
        onPull={(id) => void useLive.getState().toggleGoing(id)}
        status={status}
        error={error}
        sample={sample}
        onRetry={() => void useLive.getState().load()}
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
  pills: { position: 'absolute', left: 12, right: 76 },
  titlePill: { paddingHorizontal: 16, paddingVertical: 8, maxWidth: '68%' },
  title: { fontSize: 20, lineHeight: 24, fontWeight: '800', letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 13, lineHeight: 16, fontWeight: '500', color: colors.textSecondary },
  controls: { width: 52, alignItems: 'center', paddingVertical: 4 },
  controlButton: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
  controlDivider: { width: 28, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
});
