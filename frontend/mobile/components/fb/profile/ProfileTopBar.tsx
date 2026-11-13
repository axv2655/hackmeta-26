import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import type { ImageRef } from '@/lib/mock';
import { colors, layout, motion, shadows, spacing, type as typeScale } from '@/lib/theme';

/** Height of the profile's floating top bar, below the safe-area inset. */
export const PROFILE_BAR_HEIGHT = 52;

const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);
const BUBBLE = 30;

export type ProfileTopBarProps = {
  /** Safe-area top inset. */
  topInset: number;
  /** False while the bar floats over the gradient (white glyphs, clear background). */
  solid: boolean;
  title: string;
  avatar: ImageRef;
  onPressMenu?: () => void;
  onPressEdit?: () => void;
  onPressAvatar?: () => void;
  onPressMore?: () => void;
};

/**
 * Profile top bar: hamburger at the left; pencil, a small avatar bubble and the outlined
 * "more" button at the right. Clear over the gradient, fades to white (with the name)
 * once the white sheet scrolls under it.
 */
export function ProfileTopBar({
  topInset,
  solid,
  title,
  avatar,
  onPressMenu,
  onPressEdit,
  onPressAvatar,
  onPressMore,
}: ProfileTopBarProps) {
  const progress = useSharedValue(solid ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(solid ? 1 : 0, { duration: motion.fast, easing: EASE_OUT }));
  }, [progress, solid]);

  const backgroundStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 6 }],
  }));

  const glyph = solid ? colors.text : colors.white;

  return (
    <View style={[styles.root, { paddingTop: topInset, height: topInset + PROFILE_BAR_HEIGHT }]}>
      <Animated.View style={[styles.background, backgroundStyle]} />

      <View style={styles.bar}>
        <IconButton
          name="menu"
          size={28}
          color={glyph}
          haptic
          accessibilityLabel="Menu"
          onPress={onPressMenu}
          style={[styles.menu, !solid && styles.glyphShadow]}
        />

        <Animated.View style={[styles.titleWrap, titleStyle]}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </Animated.View>

        <View style={styles.actions}>
          {onPressEdit ? (
            <IconButton
              name="pencil"
              size={24}
              color={glyph}
              accessibilityLabel="Edit profile"
              onPress={onPressEdit}
              style={!solid && styles.glyphShadow}
            />
          ) : null}
          {onPressAvatar ? (
            <PressableScale
              onPress={onPressAvatar}
              scaleTo={0.92}
              pressedOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Your avatar"
              style={styles.bubbleTarget}
            >
              <View style={[styles.bubble, solid && styles.bubbleSolid]}>
                <Image source={avatar} style={styles.fill} contentFit="cover" transition={0} />
              </View>
            </PressableScale>
          ) : (
            <View style={styles.bubbleTarget} accessible={false}>
              <View style={[styles.bubble, solid && styles.bubbleSolid]}>
                <Image source={avatar} style={styles.fill} contentFit="cover" transition={0} />
              </View>
            </View>
          )}
          {onPressMore ? (
            <IconButton
              name="more"
              variant="outline"
              size={16}
              circleSize={29}
              color={glyph}
              accessibilityLabel="More profile options"
              onPress={onPressMore}
              style={!solid && styles.glyphShadow}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  background: { ...StyleSheet.absoluteFill, backgroundColor: colors.white },
  bar: {
    height: PROFILE_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  menu: { marginLeft: spacing.xxs },
  titleWrap: {
    position: 'absolute',
    left: 64,
    right: 136,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  title: { ...typeScale.headerTitle },
  actions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  bubbleTarget: {
    width: layout.hitTarget,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: colors.grayButton,
  },
  bubbleSolid: { borderColor: colors.grayButton },
  fill: { width: '100%', height: '100%' },
  glyphShadow: { ...shadows.card },
});

export default ProfileTopBar;
