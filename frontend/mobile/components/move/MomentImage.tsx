import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';

import { Icon } from '@/components/ui/Icon';
import { BACKEND_URL } from '@/lib/backend';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import type { Moment } from '@/lib/types';

type Props = {
  moment: Pick<Moment, 'media_url' | 'media_type' | 'caption'>;
  style?: StyleProp<ViewStyle>;
  fit?: ImageContentFit;
};

/** A Moment's photo from `/media/...`, sent with `X-User-Id` (the server checks who may see it). */
export function MomentImage({ moment, style, fit = 'cover' }: Props) {
  const userId = useSession((s) => s.userId);
  const uri = moment.media_url.startsWith('http') ? moment.media_url : `${BACKEND_URL}${moment.media_url}`;
  return (
    <View style={[styles.wrap, style]}>
      <Image
        source={{ uri, headers: { 'X-User-Id': userId } }}
        style={StyleSheet.absoluteFill}
        contentFit={fit}
        transition={120}
        accessibilityLabel={moment.caption || 'Moment'}
      />
      {moment.media_type === 'clip' ? (
        <View style={styles.clip} pointerEvents="none">
          <Icon name="play" size={14} color={colors.white} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.grayButton, overflow: 'hidden' },
  clip: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
