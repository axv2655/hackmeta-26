import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon } from '@/components/ui/Icon';
import type { ImageRef } from '@/lib/mock';
import { colors, fontWeights, radii, shadows, spacing, type as typeScale } from '@/lib/theme';

import { canvasTextSize, getBackground, GRADIENT_END, GRADIENT_START } from './backgrounds';

export type PostPreviewCardProps = {
  text: string;
  image?: ImageRef;
  backgroundId: string | null;
  style?: StyleProp<ViewStyle>;
};

const CARD_WIDTH = 340;
const MEDIA_HEIGHT = 310;
/** White lip under the media, as on Facebook's share screen. */
const LIP = 11;

/**
 * The card at the top of the New post screen: the photo (caption overlaid in
 * white), the colored text card, or the plain text of the post.
 */
export function PostPreviewCard({ text, image, backgroundId, style }: PostPreviewCardProps) {
  const caption = text.trim();
  const background = image === undefined ? getBackground(backgroundId) : undefined;
  const onDark = image !== undefined || background !== undefined;
  const size = canvasTextSize(caption.length);

  const summary =
    image !== undefined
      ? caption
        ? `Photo with caption: ${caption}`
        : 'Photo'
      : caption || 'Nothing to preview yet';

  return (
    <View
      style={[styles.card, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Post preview. ${summary}`}
    >
      <View style={styles.media}>
        {image !== undefined ? (
          <>
            <Image source={image} style={styles.fill} contentFit="cover" transition={0} />
            {caption ? <View style={[styles.fill, styles.scrim]} /> : null}
          </>
        ) : background ? (
          <LinearGradient
            colors={background.colors}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={styles.fill}
          />
        ) : null}

        {caption ? (
          <Text
            style={[styles.caption, size, onDark ? styles.captionOnDark : styles.captionOnLight]}
            numberOfLines={Math.floor((MEDIA_HEIGHT - spacing.xxl * 2) / size.lineHeight)}
          >
            {caption}
          </Text>
        ) : image === undefined ? (
          <View style={styles.empty}>
            <Icon name="image" size={32} color={colors.placeholder} />
            <Text style={styles.emptyText}>Nothing to preview yet</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The shadow lives on the outer view; clipping happens on `media` so the shadow is not cut off.
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: CARD_WIDTH,
    paddingBottom: LIP,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadows.raised,
  },
  media: {
    height: MEDIA_HEIGHT,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: { backgroundColor: colors.scrimLight },
  caption: {
    paddingHorizontal: spacing.xxl,
    textAlign: 'center',
    fontWeight: '800',
  },
  captionOnDark: {
    color: colors.white,
    textShadowColor: colors.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  captionOnLight: { color: colors.text, fontWeight: fontWeights.bold },
  empty: { alignItems: 'center', gap: spacing.sm },
  emptyText: { ...typeScale.rowSub },
});

export default PostPreviewCard;
