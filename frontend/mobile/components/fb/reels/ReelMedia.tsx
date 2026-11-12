import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { ImageRef } from '@/lib/mock';
import { colors } from '@/lib/theme';

import { BOTTOM_GRADIENT, BOTTOM_GRADIENT_STOPS, KEN_BURNS_SWEEP_MS, TOP_GRADIENT } from './constants';

/** The frame is always a little oversized so panning never exposes an edge. */
const SCALE_FROM = 1.04;
const SCALE_TO = 1.16;
const PAN_X = 10;
const PAN_Y = 14;

const SWEEP_EASING = Easing.inOut(Easing.quad);

export type ReelMediaProps = {
  source: ImageRef;
  /** Run the slow zoom/pan. When false the frame holds wherever it was. */
  playing: boolean;
  /** Alternates the pan direction between neighbouring reels. */
  index: number;
  /** Load this frame ahead of the others (the first reel). */
  priority?: boolean;
};

/**
 * The still 9:16 frame standing in for video: fills the page, drifts with a
 * slow Ken Burns zoom/pan while the reel plays, and sits under top and bottom
 * gradients that keep the white chrome legible. Skips the drift under Reduce
 * Motion.
 */
function ReelMediaBase({ source, playing, index, priority = false }: ReelMediaProps) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const direction = index % 2 === 0 ? 1 : -1;

  useEffect(() => {
    if (!playing || reduceMotion) {
      cancelAnimation(progress);
      return;
    }
    // Resume from wherever the frame was held, then sweep back and forth forever.
    const from = Math.min(Math.max(progress.get(), 0), 1);
    // A fresh sweep eases in and out like every later one; a resumed sweep only needs to ease out.
    const firstLegEasing = from < 0.01 ? SWEEP_EASING : Easing.out(Easing.quad);
    progress.set(
      withSequence(
        withTiming(1, { duration: Math.max(1, (1 - from) * KEN_BURNS_SWEEP_MS), easing: firstLegEasing }),
        withRepeat(withTiming(0, { duration: KEN_BURNS_SWEEP_MS, easing: SWEEP_EASING }), -1, true),
      ),
    );
    return () => cancelAnimation(progress);
  }, [playing, reduceMotion, progress]);

  const frameStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      transform: [
        { translateX: direction * PAN_X * p },
        { translateY: -direction * PAN_Y * p },
        { scale: SCALE_FROM + (SCALE_TO - SCALE_FROM) * p },
      ],
    };
  });

  return (
    <View style={styles.fill}>
      <Animated.View style={[styles.fill, frameStyle]}>
        <Image
          source={source}
          style={styles.image}
          contentFit="cover"
          transition={150}
          priority={priority ? 'high' : 'normal'}
          accessible={false}
        />
      </Animated.View>
      <LinearGradient colors={TOP_GRADIENT} style={styles.topGradient} />
      <LinearGradient colors={BOTTOM_GRADIENT} locations={BOTTOM_GRADIENT_STOPS} style={styles.bottomGradient} />
    </View>
  );
}

export const ReelMedia = memo(ReelMediaBase);

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: colors.darkBg,
  },
  image: { flex: 1 },
  topGradient: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 150,
    pointerEvents: 'none',
  },
  bottomGradient: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    left: 0,
    height: '55%',
    pointerEvents: 'none',
  },
});

export default ReelMedia;
