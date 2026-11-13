import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { colors, fontWeights, hairlineWidth, layout, radius, spacing } from '@/lib/theme';

import { composerBackgrounds, GRADIENT_END, GRADIENT_START } from './backgrounds';

export type BackgroundSwatchesProps = {
  /** Selected background id, or null for the plain white post. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

const TILE = 30;
const RING = 38;

/** Row of background choices: plain first, then six colors. */
export function BackgroundSwatches({ selectedId, onSelect }: BackgroundSwatchesProps) {
  const choose = (id: string | null) => {
    if (id === selectedId) return;
    selection();
    onSelect(id);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.scroll}
      contentContainerStyle={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel="Post background"
    >
      <PressableScale
        onPress={() => choose(null)}
        scaleTo={0.9}
        style={styles.target}
        accessibilityRole="radio"
        accessibilityLabel="No background"
        accessibilityState={{ selected: selectedId === null }}
      >
        <View style={[styles.ring, selectedId === null && styles.ringSelected]}>
          <View style={[styles.tile, styles.plainTile]}>
            <Text style={styles.plainGlyph} allowFontScaling={false}>
              Aa
            </Text>
          </View>
        </View>
      </PressableScale>

      {composerBackgrounds.map((bg) => {
        const selected = bg.id === selectedId;
        return (
          <PressableScale
            key={bg.id}
            onPress={() => choose(bg.id)}
            scaleTo={0.9}
            style={styles.target}
            accessibilityRole="radio"
            accessibilityLabel={`${bg.name} background`}
            accessibilityState={{ selected }}
          >
            <View style={[styles.ring, selected && styles.ringSelected]}>
              <LinearGradient colors={bg.colors} start={GRADIENT_START} end={GRADIENT_END} style={styles.tile} />
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView would otherwise stretch to fill a column parent.
  scroll: { flexGrow: 0 },
  row: {
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  target: {
    width: layout.hitTarget,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The ring is always laid out so selecting never shifts the tiles.
  ring: {
    width: RING,
    height: RING,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: { borderColor: colors.blue },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  plainTile: {
    backgroundColor: colors.white,
    borderWidth: hairlineWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plainGlyph: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
});

export default BackgroundSwatches;
