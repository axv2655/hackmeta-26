import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import type { ImageRef } from '@/lib/mock/types';
import { colors, hairlineWidth, layout } from '@/lib/theme';

import { PressableScale } from './PressableScale';

export type AvatarRing = 'none' | 'unseen' | 'seen';

export type AvatarProps = {
  source: ImageRef;
  /** Diameter of the photo. Default 40. */
  size?: number;
  /** Story ring around the photo: blue when 'unseen', gray when 'seen'. Adds 6pt to the outer size. */
  ring?: AvatarRing;
  /** Green presence dot at the bottom right. */
  online?: boolean;
  /** Anything to pin to the bottom-right corner (an `IconBadge`, a `ReactionBadge`). Replaces the online dot. */
  badge?: ReactNode;
  /** Makes the avatar tappable with press feedback. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const RING_WIDTH = 2;
const RING_GAP = 1;

/** Round profile photo with optional story ring, online dot or corner badge. */
export function Avatar({
  source,
  size = layout.avatar,
  ring = 'none',
  online = false,
  badge,
  onPress,
  accessibilityLabel,
  style,
}: AvatarProps) {
  const hasRing = ring !== 'none';
  const outer = hasRing ? size + (RING_WIDTH + RING_GAP) * 2 : size;
  const dot = Math.max(10, Math.round(size * 0.26));

  const content = (
    <>
      <View
        style={[
          styles.center,
          { width: outer, height: outer, borderRadius: outer / 2 },
          hasRing && {
            borderWidth: RING_WIDTH,
            borderColor: ring === 'unseen' ? colors.blue : colors.hairline,
          },
        ]}
      >
        <Image
          source={source}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          contentFit="cover"
          transition={0}
          accessible={false}
        />
      </View>
      {badge != null ? (
        <View style={[styles.corner, styles.passthrough]}>
          {badge}
        </View>
      ) : online ? (
        <View
          style={[styles.corner, styles.dot, styles.passthrough, { width: dot, height: dot, borderRadius: dot / 2 }]}
        />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        hitSlop={Math.max(0, (layout.hitTarget - outer) / 2)}
        style={[{ width: outer, height: outer }, style]}
      >
        {content}
      </PressableScale>
    );
  }

  return (
    <View
      style={[{ width: outer, height: outer }, style]}
      accessible={accessibilityLabel != null}
      accessibilityRole={accessibilityLabel != null ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  image: {
    backgroundColor: colors.grayButton,
    borderWidth: hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  corner: { position: 'absolute', right: -2, bottom: -2 },
  passthrough: { pointerEvents: 'none' },
  dot: {
    right: 0,
    bottom: 0,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.white,
  },
});

export default Avatar;
