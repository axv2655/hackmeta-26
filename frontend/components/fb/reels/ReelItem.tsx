import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import PlayGlyph from 'lucide-react-native/icons/play';

import { tap } from '@/lib/haptics';
import type { Reel } from '@/lib/mock';
import { colors, layout, motion } from '@/lib/theme';

import {
  DOUBLE_TAP_MS,
  EASE_OUT,
  OVERLAY_BOTTOM_INSET,
  PROGRESS_BAR_HEIGHT,
  PROGRESS_BOTTOM_INSET,
  RAIL_COLUMN_WIDTH,
} from './constants';
import { HeartBurst } from './HeartBurst';
import { ReelActionRail } from './ReelActionRail';
import { ReelInfo } from './ReelInfo';
import { ReelMedia } from './ReelMedia';
import { ReelProgressBar } from './ReelProgressBar';
import { useReelsStore } from './store';

type Burst = { id: number; x: number; y: number; rotation: number };

const PAUSE_DISC = 76;
const MAX_BURSTS = 6;

/** Centered play glyph that fades in while the reel is paused. */
function PauseIndicator({ visible }: { visible: boolean }) {
  const shown = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    shown.set(withTiming(visible ? 1 : 0, { duration: visible ? motion.fast : motion.base, easing: EASE_OUT }));
  }, [visible, shown]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: reduceMotion ? 1 : 0.9 + 0.1 * shown.get() }],
  }));

  return (
    <View style={styles.pauseLayer}>
      <Animated.View style={[styles.pauseDisc, style]}>
        <PlayGlyph size={34} color={colors.darkText} fill={colors.darkText} strokeWidth={2} style={styles.playGlyph} />
      </Animated.View>
    </View>
  );
}

/**
 * Where the press landed inside the touch layer. Native presses carry
 * `locationX/Y`; on web the press arrives as a DOM click, which has
 * `offsetX/Y` instead. Falls back to the given point (the page center).
 */
function tapPoint(event: GestureResponderEvent, fallbackX: number, fallbackY: number): { x: number; y: number } {
  const native = event.nativeEvent as {
    locationX?: number;
    locationY?: number;
    offsetX?: number;
    offsetY?: number;
  };
  const x = isFiniteNumber(native.locationX) ? native.locationX : native.offsetX;
  const y = isFiniteNumber(native.locationY) ? native.locationY : native.offsetY;
  return {
    x: isFiniteNumber(x) ? x : fallbackX,
    y: isFiniteNumber(y) ? y : fallbackY,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export type ReelItemProps = {
  reel: Reel;
  index: number;
  /** Page size: the pager's viewport. */
  width: number;
  height: number;
  /** This reel is the visible page and the Reels tab is focused. */
  active: boolean;
  /** Place chip tap. The Moves feature hooks in here; a no-op until then. */
  onPressPlace?: (reel: Reel) => void;
  onPressAuthor?: (reel: Reel) => void;
  onPressComment?: (reel: Reel) => void;
  onPressShare?: (reel: Reel) => void;
  onPressMore?: (reel: Reel) => void;
};

/**
 * One full-page reel: media, gradients, author/caption block, action rail and
 * progress bar. A single tap on the media pauses or resumes it; a double tap
 * loves it and bursts a heart at the tap point.
 */
function ReelItemBase({
  reel,
  index,
  width,
  height,
  active,
  onPressPlace,
  onPressAuthor,
  onPressComment,
  onPressShare,
  onPressMore,
}: ReelItemProps) {
  const setReaction = useReelsStore((s) => s.setReaction);
  const [paused, setPaused] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);

  const lastTapAt = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextBurstId = useRef(0);

  const clearSingleTap = useCallback(() => {
    if (singleTapTimer.current != null) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
  }, []);

  // Scrolling away always leaves the reel ready to play from the start.
  useEffect(() => {
    if (active) return;
    clearSingleTap();
    lastTapAt.current = 0;
    setPaused(false);
    setBursts([]);
  }, [active, clearSingleTap]);

  useEffect(() => clearSingleTap, [clearSingleTap]);

  const love = useCallback(
    (x: number, y: number) => {
      tap();
      setReaction(reel.id, 'love');
      const id = nextBurstId.current;
      nextBurstId.current += 1;
      // Alternate the tilt so stacked hearts fan out instead of overlapping exactly.
      const rotation = ((id % 3) - 1) * 14;
      setBursts((current) => [...current.slice(-(MAX_BURSTS - 1)), { id, x, y, rotation }]);
    },
    [reel.id, setReaction],
  );

  const onPressMedia = useCallback(
    (event: GestureResponderEvent) => {
      const now = Date.now();
      const { x, y } = tapPoint(event, width / 2, height / 2);

      if (now - lastTapAt.current < DOUBLE_TAP_MS) {
        // Second (or third, fourth...) tap of a run: like, and keep the run alive.
        clearSingleTap();
        lastTapAt.current = now;
        love(x, y);
        return;
      }

      lastTapAt.current = now;
      clearSingleTap();
      // Wait out the double-tap window before treating this as a pause/play tap.
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        setPaused((value) => !value);
      }, DOUBLE_TAP_MS);
    },
    [clearSingleTap, height, love, width],
  );

  const removeBurst = useCallback((id: number) => {
    setBursts((current) => current.filter((burst) => burst.id !== id));
  }, []);

  const handlePressPlace = useCallback(() => onPressPlace?.(reel), [onPressPlace, reel]);
  const handlePressAuthor = useCallback(() => onPressAuthor?.(reel), [onPressAuthor, reel]);
  const handlePressComment = useCallback(() => onPressComment?.(reel), [onPressComment, reel]);
  const handlePressShare = useCallback(() => onPressShare?.(reel), [onPressShare, reel]);
  const handlePressMore = useCallback(() => onPressMore?.(reel), [onPressMore, reel]);

  const playing = active && !paused;
  const infoWidth = Math.max(0, width - layout.gutter - RAIL_COLUMN_WIDTH - 4);

  return (
    <View style={[styles.page, { width, height }]}>
      <ReelMedia source={reel.poster} playing={playing} index={index} priority={index === 0} />

      <Pressable
        onPress={onPressMedia}
        style={styles.touchLayer}
        accessibilityRole="button"
        accessibilityLabel={`Reel by ${reel.author.name}`}
        accessibilityHint={paused ? 'Tap to play, double tap to like' : 'Tap to pause, double tap to like'}
      />

      <PauseIndicator visible={paused && active} />

      {bursts.length > 0 ? (
        <View style={styles.burstLayer}>
          {bursts.map((burst) => (
            <HeartBurst
              key={burst.id}
              x={burst.x}
              y={burst.y}
              rotation={burst.rotation}
              onDone={() => removeBurst(burst.id)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.overlay}>
        <ReelInfo
          reel={reel}
          width={infoWidth}
          active={active}
          onPressAuthor={handlePressAuthor}
          onPressPlace={handlePressPlace}
        />
        <ReelActionRail
          reel={reel}
          onPressComment={handlePressComment}
          onPressShare={handlePressShare}
          onPressMore={handlePressMore}
        />
      </View>

      <ReelProgressBar
        width={Math.max(0, width - layout.gutter * 2)}
        active={active}
        playing={playing}
        style={styles.progress}
      />
    </View>
  );
}

export const ReelItem = memo(ReelItemBase);

const styles = StyleSheet.create({
  page: {
    overflow: 'hidden',
    backgroundColor: colors.darkBg,
  },
  touchLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  pauseLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  pauseDisc: {
    width: PAUSE_DISC,
    height: PAUSE_DISC,
    borderRadius: PAUSE_DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  // The play triangle's visual center sits left of its box center.
  playGlyph: { marginLeft: 4 },
  burstLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
  },
  // Children take touches; the empty area between them falls through to the media.
  overlay: {
    position: 'absolute',
    right: 0,
    bottom: PROGRESS_BOTTOM_INSET + PROGRESS_BAR_HEIGHT + OVERLAY_BOTTOM_INSET,
    left: layout.gutter,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  progress: {
    position: 'absolute',
    bottom: PROGRESS_BOTTOM_INSET,
    left: layout.gutter,
  },
});

export default ReelItem;
