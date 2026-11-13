import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { BottomSheetBackgroundProps, BottomSheetHandleProps } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTabBarHeight } from '@/components/fb/TabBar';
import { GlassSurface } from '@/components/ui/Glass';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import { CATEGORY_META, type MoveCategory } from '@/lib/mock/moves';
import { colors } from '@/lib/theme';

export const SHEET_RADIUS = 34;

/** Gap kept between the floating sheet and the floating tab bar. */
export function useSheetBottomInset(): number {
  // useTabBarHeight() = bar + gap + home-indicator inset; the bar itself sits
  // a little lower than that, so tuck the sheet ~6pt above its top edge.
  return useTabBarHeight() - 14;
}

/**
 * Liquid-glass sheet body. The glass is never faded (opacity kills the
 * effect); it simply moves with the sheet.
 */
export function SheetGlassBackground({ style, animatedPosition }: BottomSheetBackgroundProps) {
  const { height } = useWindowDimensions();
  const bottomInset = useSheetBottomInset();
  // Like the content, clip to the visible sheet so the glass doesn't run on
  // behind the tab bar.
  const clip = useAnimatedStyle(() => ({
    height: Math.max(0, height - bottomInset - animatedPosition.value),
  }));
  return (
    <View pointerEvents="none" style={style}>
      <Animated.View style={[styles.bgWrap, clip]}>
        <GlassSurface radius={SHEET_RADIUS} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

export function SheetHandle(_: BottomSheetHandleProps) {
  return (
    <View style={styles.handleWrap}>
      <View style={styles.handle} />
    </View>
  );
}

/** Round Bitmoji selfie on a soft tinted disc, the list-row avatar. */
export function BitmojiFace({
  userId,
  size = 52,
  category,
  ghost = false,
}: {
  userId: string;
  size?: number;
  category?: MoveCategory;
  ghost?: boolean;
}) {
  const ring = category ? CATEGORY_META[category].color : colors.blue;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2.5,
        borderColor: ghost ? colors.hairline : ring,
        backgroundColor: ghost ? colors.surface : '#EEF3FF',
        overflow: 'hidden',
      }}
    >
      <Image
        source={bitmojiFor(userId, 'selfie')}
        style={[{ width: '100%', height: '100%' }, ghost && { opacity: 0.5 }]}
        contentFit="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bgWrap: { borderRadius: SHEET_RADIUS, overflow: 'hidden' },
  handleWrap: { alignItems: 'center', paddingTop: 7, paddingBottom: 5 },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(60,60,67,0.3)' },
});
