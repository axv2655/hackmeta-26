import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from '@/components/ui/Icon';
import type { ImageRef } from '@/lib/mock/types';
import type { MoveCategory, MoveStatus } from '@/lib/mock/moves';
import { CATEGORY_META } from '@/lib/mock/moves';
import { colors, shadows } from '@/lib/theme';

export type AvatarPinProps = {
  image: ImageRef;
  /** First line of the label: "Maya", "Me". */
  name: string;
  /** Second line: "now", "18 m", "on the way". */
  detail: string;
  category?: MoveCategory;
  status?: MoveStatus | 'me';
  /** Extra friends at the same Mark, shown as "+2". */
  extraCount?: number;
  selected?: boolean;
};

const BODY = 66;

/**
 * Snap-Map-style map pin: a full-body Bitmoji standing on a soft ground
 * shadow, with a name label under its feet. Ghosts (left within 24 h) are
 * faded. Kept light on purpose: one image and two texts per pin, no glass.
 */
export function AvatarPin({ image, name, detail, category, status = 'there', extraCount = 0, selected = false }: AvatarPinProps) {
  const ghost = status === 'ghost';
  const meta = category ? CATEGORY_META[category] : undefined;
  const size = selected ? BODY * 1.2 : BODY;

  return (
    <View style={styles.root} pointerEvents="none">
      <View style={{ width: size, height: size }}>
        <View style={[styles.shadow, { width: size * 0.5, left: size * 0.25 }]} />
        <Image
          source={image}
          style={[StyleSheet.absoluteFill, ghost && styles.ghost]}
          contentFit="contain"
          contentPosition="bottom"
        />
        {meta ? (
          <View style={[styles.badge, { backgroundColor: ghost ? colors.placeholder : meta.color }]}>
            <Icon name={meta.icon} size={12} color={colors.white} />
          </View>
        ) : null}
      </View>
      <View style={[styles.label, ghost && styles.labelGhost, selected && styles.labelSelected]}>
        <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
          {name}
          {extraCount > 0 ? <Text style={styles.extra}>{`  +${extraCount}`}</Text> : null}
        </Text>
        <Text
          style={[styles.detail, status === 'there' || status === 'me' ? styles.detailLive : null, selected && styles.nameSelected]}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  ghost: { opacity: 0.45 },
  shadow: {
    position: 'absolute',
    bottom: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  label: {
    marginTop: -2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    maxWidth: 140,
    ...shadows.raised,
  },
  labelSelected: { backgroundColor: colors.blue },
  labelGhost: { backgroundColor: 'rgba(255,255,255,0.8)' },
  name: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: colors.text },
  nameSelected: { color: colors.white },
  extra: { fontWeight: '600', color: colors.textSecondary },
  detail: { fontSize: 11, lineHeight: 13, fontWeight: '600', color: colors.textSecondary },
  detailLive: { color: colors.online },
});

export default AvatarPin;
