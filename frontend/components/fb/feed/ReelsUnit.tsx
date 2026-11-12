import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import ArrowRight from 'lucide-react-native/icons/arrow-right';

import { PressableScale } from '@/components/ui/PressableScale';
import { formatCount, reels as mockReels, type Reel } from '@/lib/mock';
import { colors, hairline, layout, spacing, type as typeScale } from '@/lib/theme';

import { UnitHeader } from './UnitHeader';

export type ReelsUnitProps = {
  /** Defaults to "Reels and short videos". */
  title?: string;
  /** Defaults to the first five seeded reels. */
  reels?: Reel[];
  /** Tapping a reel (or "See more"). Defaults to switching to the Reels tab. */
  onPressReel?: (reel?: Reel) => void;
  onPressMore?: () => void;
  style?: StyleProp<ViewStyle>;
};

const CARD_WIDTH = 190;
const CARD_HEIGHT = Math.round((CARD_WIDTH * 16) / 9);
const CARD_RADIUS = 10;
const CARD_GAP = spacing.sm;
const ARROW_DISC = 60;

const SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)'] as const;

function PlayGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7.5 4.6v14.8a1 1 0 0 0 1.53.85l11.6-7.4a1 1 0 0 0 0-1.7L9.03 3.75A1 1 0 0 0 7.5 4.6z" fill={colors.white} />
    </Svg>
  );
}

/** "Reels and short videos": a title row and a horizontal strip of 9:16 poster cards with view counts. */
export function ReelsUnit({
  title = 'Reels and short videos',
  reels = mockReels.slice(0, 5),
  onPressReel,
  onPressMore,
  style,
}: ReelsUnitProps) {
  const router = useRouter();
  const openReels = onPressReel ?? (() => router.navigate('/reels'));

  return (
    <View style={[styles.root, style]}>
      <UnitHeader title={title} icon="reels" height={48} onPressMore={onPressMore} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.strip}
      >
        {reels.map((reel) => (
          <PressableScale
            key={reel.id}
            onPress={() => openReels(reel)}
            pressedOpacity={0.85}
            accessibilityLabel={`Reel by ${reel.author.name}, ${formatCount(reel.viewCount)} views`}
            style={styles.card}
          >
            <Image source={reel.poster} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
            <LinearGradient colors={SCRIM} style={styles.scrim} />
            <View style={styles.views}>
              <PlayGlyph size={14} />
              <Text style={styles.viewsText}>{formatCount(reel.viewCount)}</Text>
            </View>
          </PressableScale>
        ))}
        <PressableScale
          onPress={() => openReels()}
          accessibilityLabel="See more reels and short videos"
          style={[styles.card, styles.moreCard]}
        >
          <View style={styles.arrowDisc}>
            <ArrowRight size={28} color={colors.text} strokeWidth={2} />
          </View>
          <Text style={styles.moreText}>{'See more\nreels and\nshort videos'}</Text>
        </PressableScale>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  strip: {
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.md,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: colors.grayButton,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 88,
    pointerEvents: 'none',
  },
  views: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  viewsText: { ...typeScale.label, fontSize: 14, lineHeight: 18, color: colors.white },
  moreCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    ...hairline(),
  },
  arrowDisc: {
    width: ARROW_DISC,
    height: ARROW_DISC,
    borderRadius: ARROW_DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.grayButton,
  },
  moreText: { ...typeScale.name, textAlign: 'center' },
});

export default ReelsUnit;
