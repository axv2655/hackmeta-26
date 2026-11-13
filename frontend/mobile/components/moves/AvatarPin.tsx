import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Icon, type IconName } from '@/components/ui/Icon';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import type { ImageRef } from '@/lib/mock/types';
import type { MoveStatus } from '@/lib/mock/moves';
import { colors, shadows } from '@/lib/theme';

export type AvatarPinProps = {
  image: ImageRef;
  /** First line of the label: "Maya", "Me". */
  name: string;
  /** Second line: "now", "18 m", "on the way". */
  detail: string;
  /** Category badge (lib/categories); omitted for the "Me" pin. */
  badge?: { icon: IconName; color: string };
  status?: MoveStatus | 'me';
  /** Extra friends at the same Mark, shown as "+2". */
  extraCount?: number;
  /** User ids of the people already there (the avatar trail). */
  trail?: string[];
  selected?: boolean;
};

const BODY = 66;
const TRAIL_MAX = 3;

/**
 * Snap-Map-style map pin: a full-body Bitmoji standing on a soft ground
 * shadow, with a name label under its feet. Ghosts (were there in the last
 * day) are gray. A live pin carries small faces of the people already there.
 */
export function AvatarPin({ image, name, detail, badge, status = 'there', extraCount = 0, trail = [], selected = false }: AvatarPinProps) {
  const ghost = status === 'ghost';
  const size = selected ? BODY * 1.2 : BODY;
  const faces = ghost ? [] : trail.slice(0, TRAIL_MAX);

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
        {badge ? (
          <View style={[styles.badge, { backgroundColor: ghost ? colors.placeholder : badge.color }]}>
            <Icon name={badge.icon} size={12} color={colors.white} />
          </View>
        ) : null}
        {faces.length > 0 ? (
          <View style={styles.trail}>
            {faces.map((id, i) => (
              <View key={id} style={[styles.trailFace, i > 0 && styles.trailOverlap]}>
                <Image source={bitmojiFor(id, 'selfie')} style={styles.trailImage} contentFit="cover" />
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.label, ghost && styles.labelGhost, selected && styles.labelSelected]}>
        <Text style={[styles.name, ghost && styles.textGhost, selected && styles.nameSelected]} numberOfLines={1}>
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

/** A Saved Mark on the map: a small bookmark disc with the place name. */
export function SavedPin({ name, color }: { name: string; color: string }) {
  return (
    <View style={styles.root} pointerEvents="none">
      <View style={[styles.savedDisc, { backgroundColor: color }]}>
        <Icon name="bookmark" size={14} color={colors.white} />
      </View>
      <View style={styles.savedLabel}>
        <Text style={styles.savedText} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  ghost: { opacity: 0.4 },
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
  trail: { position: 'absolute', left: 0, bottom: 10, flexDirection: 'row' },
  trailFace: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: '#EEF3FF',
    overflow: 'hidden',
  },
  trailOverlap: { marginLeft: -8 },
  trailImage: { width: '100%', height: '100%' },
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
  labelGhost: { backgroundColor: 'rgba(240,242,245,0.9)' },
  name: { fontSize: 13, lineHeight: 16, fontWeight: '700', color: colors.text },
  textGhost: { color: colors.textSecondary },
  nameSelected: { color: colors.white },
  extra: { fontWeight: '600', color: colors.textSecondary },
  detail: { fontSize: 11, lineHeight: 13, fontWeight: '600', color: colors.textSecondary },
  detailLive: { color: colors.online },
  savedDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    ...shadows.raised,
  },
  savedLabel: {
    marginTop: 2,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    maxWidth: 120,
  },
  savedText: { fontSize: 11, lineHeight: 13, fontWeight: '600', color: colors.text },
});

export default AvatarPin;
