import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { currentUser } from '@/lib/mock';
import { colors, hairline, layout, radii, type as typeScale } from '@/lib/theme';

export type CreateStoryCardProps = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const PHOTO_HEIGHT = Math.round(layout.storyCardHeight * 0.66);
const PLUS_SIZE = 32;
const PLUS_RING = 3;
const PLUS_OUTER = PLUS_SIZE + PLUS_RING * 2;

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
        <Text style={styles.label}>{'Create\nstory'}</Text>
      </View>
      <View style={styles.plusRing}>
        <View style={styles.plus}>
          <Icon name="plus" size={22} color={colors.white} />
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    width: layout.storyCardWidth,
    height: layout.storyCardHeight,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.white,
    ...hairline(),
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
    paddingBottom: 6,
  },
  label: { ...typeScale.label, textAlign: 'center' },
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
});

export default CreateStoryCard;
