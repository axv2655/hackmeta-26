import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { currentUser } from '@/lib/mock';
import { colors, fontWeights, hairlineWidth } from '@/lib/theme';

import { STORY_CARD_BORDER, STORY_CARD_HEIGHT, STORY_CARD_RADIUS, STORY_CARD_WIDTH } from './storyMetrics';

export type CreateStoryCardProps = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The photo fills the top two thirds; the lower third is the pale label panel. */
const PHOTO_HEIGHT = Math.round(STORY_CARD_HEIGHT * 0.665);
const PLUS_SIZE = 32;
const PLUS_RING = 3;
const PLUS_OUTER = PLUS_SIZE + PLUS_RING * 2;
/** Label panel: a hair lighter than `colors.surface`, as in the reference. */
const PANEL_BG = '#F7F8FA';

/** First card of the stories row: your photo, a blue plus straddling the seam, "Create story". */
export function CreateStoryCard({ onPress, style }: CreateStoryCardProps) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel="Create story" style={[styles.card, style]}>
      <Image
        source={currentUser.avatar}
        style={styles.photo}
        contentFit="cover"
        contentPosition="top"
        accessible={false}
      />
      <View style={styles.footer}>
        <Text style={styles.label} numberOfLines={1}>
          Create story
        </Text>
      </View>
      <View style={styles.plusRing}>
        <View style={styles.plus}>
          <Icon name="plus" size={20} color={colors.white} />
        </View>
      </View>
      <View style={styles.border} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: STORY_CARD_WIDTH,
    height: STORY_CARD_HEIGHT,
    borderRadius: STORY_CARD_RADIUS,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: PANEL_BG,
  },
  photo: {
    width: '100%',
    height: PHOTO_HEIGHT,
    backgroundColor: colors.grayButton,
  },
  footer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  label: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: fontWeights.semibold,
    letterSpacing: -0.2,
    color: colors.text,
    textAlign: 'center',
  },
  plusRing: {
    position: 'absolute',
    top: PHOTO_HEIGHT - PLUS_OUTER / 2,
    alignSelf: 'center',
    width: PLUS_OUTER,
    height: PLUS_OUTER,
    borderRadius: PLUS_OUTER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    pointerEvents: 'none',
  },
  plus: {
    width: PLUS_SIZE,
    height: PLUS_SIZE,
    borderRadius: PLUS_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },
  border: {
    ...StyleSheet.absoluteFill,
    borderRadius: STORY_CARD_RADIUS,
    borderCurve: 'continuous',
    borderWidth: hairlineWidth,
    borderColor: STORY_CARD_BORDER,
    pointerEvents: 'none',
  },
});

export default CreateStoryCard;
