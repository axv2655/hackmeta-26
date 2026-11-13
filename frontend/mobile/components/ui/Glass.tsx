import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { colors, hairlineWidth, shadows } from '@/lib/theme';

/**
 * True when the native iOS 26 liquid-glass effect can be rendered. Some iOS 26
 * betas report liquid glass without the runtime API, so both checks are needed.
 */
export const glassAvailable: boolean = (() => {
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

export type GlassSurfaceProps = {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** 'light' (default) for white screens, 'dark' for Reels. */
  tint?: 'light' | 'dark';
  /** Glass reacts to touches (buttons). Default false. */
  interactive?: boolean;
  /** Corner radius. Default 999 (capsule / circle). */
  radius?: number;
};

/**
 * Floating chrome surface: native liquid glass on iOS 26+, a translucent fill
 * with a hairline edge and soft shadow on older systems.
 */
export function GlassSurface({ style, children, tint = 'light', interactive = false, radius = 999 }: GlassSurfaceProps) {
  const dark = tint === 'dark';

  if (glassAvailable) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={dark ? 'dark' : 'light'}
        isInteractive={interactive}
        style={[{ borderRadius: radius }, style]}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          borderRadius: radius,
          backgroundColor: dark ? colors.glassFallbackDark : colors.glassFallbackLight,
          borderColor: dark ? colors.glassBorderDark : colors.glassBorderLight,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderWidth: hairlineWidth,
    ...shadows.glass,
  },
});

export default GlassSurface;
