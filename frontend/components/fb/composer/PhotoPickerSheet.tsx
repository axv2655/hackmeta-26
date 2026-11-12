import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { aspect, images, type ImageRef } from '@/lib/mock';
import { colors, motion, radii, shadows, spacing, type as typeScale } from '@/lib/theme';

export type PhotoPickerSheetProps = {
  visible: boolean;
  /** The photo already attached, if any (gets a check mark). */
  selected?: ImageRef;
  onSelect: (image: ImageRef, aspectRatio: number) => void;
  onClose: () => void;
};

type PickerPhoto = { id: string; source: ImageRef; label: string };

const PHOTOS: readonly PickerPhoto[] = [
  { id: 'p1', source: images.posts.p1, label: 'Lattes at a cafe' },
  { id: 'p2', source: images.posts.p2, label: 'Food bowls' },
  { id: 'p3', source: images.posts.p3, label: 'Friends sitting together' },
  { id: 'p4', source: images.posts.p4, label: 'Studying with laptops' },
  { id: 'p5', source: images.posts.p5, label: 'River valley at dusk' },
  { id: 'p6', source: images.posts.p6, label: 'Barbell at the gym' },
];

const ROWS: readonly (readonly PickerPhoto[])[] = [PHOTOS.slice(0, 3), PHOTOS.slice(3, 6)];

// iOS sheet curve: quick off the mark, long settle.
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);
const OPEN_MS = 280;
const CLOSE_MS = motion.base;

/**
 * Bottom sheet with the bundled mock photos, standing in for the camera roll.
 * Render it as the last child of a full-screen container: it covers its parent.
 */
export function PhotoPickerSheet({ visible, selected, onSelect, onClose }: PhotoPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  // Stays mounted through the closing animation.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const sheetHeight = useSharedValue(420);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    progress.set(
      withTiming(0, { duration: CLOSE_MS, easing: EASE_OUT }, (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      }),
    );
  }, [progress, visible]);

  // Opens one commit after mounting, so the sheet is on screen for the first frame of its slide.
  useEffect(() => {
    if (mounted && visible) progress.set(withTiming(1, { duration: OPEN_MS, easing: EASE_SHEET }));
  }, [mounted, progress, visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() =>
    // Reduced motion: the sheet fades in place instead of travelling.
    reduceMotion
      ? { opacity: progress.get(), transform: [{ translateY: 0 }] }
      : { opacity: 1, transform: [{ translateY: (1 - progress.get()) * sheetHeight.get() }] },
  );

  if (!mounted) return null;

  const onSheetLayout = (e: LayoutChangeEvent) => {
    sheetHeight.set(e.nativeEvent.layout.height);
  };

  return (
    <View style={[styles.overlay, { pointerEvents: visible ? 'auto' : 'none' }]}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={styles.fill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close photo picker"
        />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }, sheetStyle]}
        onLayout={onSheetLayout}
        accessibilityViewIsModal
      >
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View>
            <Text style={styles.title} accessibilityRole="header">
              Add photo
            </Text>
            <Text style={styles.subtitle}>Recents</Text>
          </View>
          <IconButton
            name="close"
            size={18}
            background
            backgroundSize={32}
            accessibilityLabel="Close"
            onPress={onClose}
          />
        </View>

        <View style={styles.grid}>
          {ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.gridRow}>
              {row.map((photo) => {
                const isSelected = photo.source === selected;
                return (
                  <PressableScale
                    key={photo.id}
                    onPress={() => onSelect(photo.source, aspect.post)}
                    scaleTo={0.97}
                    haptic
                    style={styles.tile}
                    accessibilityLabel={photo.label}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Image source={photo.source} style={styles.fill} contentFit="cover" transition={0} />
                    {isSelected ? (
                      <View style={styles.check}>
                        <Icon name="check" size={14} color={colors.white} strokeWidth={3} />
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    ...shadows.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
    backgroundColor: colors.hairline,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: { ...typeScale.sectionTitle },
  subtitle: { ...typeScale.meta },
  grid: { gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
    borderWidth: 1.5,
    borderColor: colors.white,
    pointerEvents: 'none',
  },
});

export default PhotoPickerSheet;
