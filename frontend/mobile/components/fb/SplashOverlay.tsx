import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUIStore } from '@/lib/store/ui';
import { colors, motion } from '@/lib/theme';

import { FLogo } from './brand/FLogo';
import { MetaLogo } from './brand/MetaLogo';

export type SplashOverlayProps = {
  /** How long the splash stays fully visible before fading, in ms. Default 1200. */
  holdMs?: number;
  /** Fade-out duration in ms. Default 250. */
  fadeMs?: number;
};

/**
 * White full-screen launch overlay: the "f" logo in the center and
 * "from Meta" near the bottom. It covers the app on first mount, fades out
 * after ~1.2s, then unmounts and flips `useUIStore().splashDone`.
 * Mount it once, last, in the root layout.
 */
export function SplashOverlay({ holdMs = 1200, fadeMs = motion.slow }: SplashOverlayProps) {
  const insets = useSafeAreaInsets();
  const setSplashDone = useUIStore((s) => s.setSplashDone);
  const [visible, setVisible] = useState(true);
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.set(withDelay(holdMs, withTiming(0, { duration: fadeMs, easing: Easing.out(Easing.quad) })));
    // A plain timer (rather than an animation callback) keeps the unmount
    // reliable on web and when the tab is backgrounded mid-fade.
    const timer = setTimeout(() => {
      setVisible(false);
      setSplashDone();
    }, holdMs + fadeMs + 30);
    return () => clearTimeout(timer);
  }, [fadeMs, holdMs, opacity, setSplashDone]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, animatedStyle]} accessibilityLabel="Facebook" accessibilityRole="image">
      <FLogo size={72} />
      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 16) + 34 }]}>
        <Text style={styles.from} allowFontScaling={false}>
          from
        </Text>
        <MetaLogo height={15} color={colors.blue} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 9,
  },
  from: {
    fontSize: 15,
    lineHeight: 18,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
});

export default SplashOverlay;
