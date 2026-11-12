import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatCount } from '@/lib/mock';
import type { ImageRef } from '@/lib/mock';
import { colors, fontWeights, layout, radius, spacing } from '@/lib/theme';

const COLUMNS = 3;
const GAP = 4;

export type MediaTile = {
  id: string;
  image: ImageRef;
  /** Reels only: shows a play glyph and this count over a bottom scrim. */
  viewCount?: number;
};

export type ProfileMediaGridProps = {
  tiles: MediaTile[];
  /** Tile width / height. 1 for photos, 9/16 for reels. */
  tileAspect?: number;
  /** Spoken name for one tile, e.g. "Photo" or "Reel". */
  itemLabel: string;
  onPressTile?: (tile: MediaTile) => void;
};

/** 3-column grid of rounded tiles used by the Photos and Reels tabs. */
export function ProfileMediaGrid({ tiles, tileAspect = 1, itemLabel, onPressTile }: ProfileMediaGridProps) {
  const rows: MediaTile[][] = [];
  for (let i = 0; i < tiles.length; i += COLUMNS) rows.push(tiles.slice(i, i + COLUMNS));

  return (
    <View style={styles.grid}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((tile, index) => (
            <PressableScale
              key={tile.id}
              onPress={() => onPressTile?.(tile)}
              scaleTo={0.98}
              pressedOpacity={0.8}
              accessibilityRole="imagebutton"
              accessibilityLabel={
                tile.viewCount !== undefined
                  ? `${itemLabel} ${rowIndex * COLUMNS + index + 1}, ${formatCount(tile.viewCount)} views`
                  : `${itemLabel} ${rowIndex * COLUMNS + index + 1}`
              }
              style={styles.cell}
            >
              {/* The ratio lives on an inner box so the flexed cell width drives the height on web too. */}
              <View style={[styles.tile, { aspectRatio: tileAspect }]}>
                <Image source={tile.image} style={styles.fill} contentFit="cover" transition={0} />
                {tile.viewCount !== undefined ? (
                  <>
                    <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.scrim} />
                    <View style={styles.views}>
                      <Icon name="play" size={13} color={colors.white} strokeWidth={2.5} />
                      <Text style={styles.viewsText}>{formatCount(tile.viewCount)}</Text>
                    </View>
                  </>
                ) : null}
              </View>
            </PressableScale>
          ))}
          {Array.from({ length: COLUMNS - row.length }, (_, i) => (
            <View key={`spacer-${i}`} style={styles.spacer} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: GAP,
    paddingTop: spacing.md,
    paddingHorizontal: layout.gutter,
    backgroundColor: colors.white,
  },
  row: { flexDirection: 'row', gap: GAP },
  cell: { flex: 1 },
  tile: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.grayButton,
  },
  spacer: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    pointerEvents: 'none',
  },
  views: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    pointerEvents: 'none',
  },
  viewsText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: fontWeights.semibold,
    color: colors.white,
  },
});

export default ProfileMediaGrid;
