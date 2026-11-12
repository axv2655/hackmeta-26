import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { aspect, type ImageRef } from '@/lib/mock';
import { colors } from '@/lib/theme';

export type PostMediaProps = {
  source: ImageRef;
  /** width / height the photo is shown at. Default 4:3 (the bundled post photos). */
  aspectRatio?: number;
  accessibilityLabel?: string;
};

/** Link posts crop their image to the wide link-card shape. */
export const LINK_IMAGE_ASPECT = 1.91;

/** Full-bleed post photo. */
export function PostMedia({ source, aspectRatio = aspect.post, accessibilityLabel }: PostMediaProps) {
  return (
    <Image
      source={source}
      style={[styles.image, { aspectRatio }]}
      contentFit="cover"
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', backgroundColor: colors.surface },
});

export default PostMedia;
