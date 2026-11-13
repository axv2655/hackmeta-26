import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { categoryMeta } from '@/lib/categories';
import { ago } from '@/lib/format';
import { reelPoster } from '@/lib/reels';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { SavedMarkItem, SavedReelItem } from '@/lib/types';

import { mediaSource } from './media';

export type SavedMarkRowProps = {
  item: SavedMarkItem;
  onPress: () => void;
  onUnsave: () => void;
};

/** A Saved Mark: photo, name, category and where it was saved from, with an unsave button. */
export function SavedMarkRow({ item, onPress, onUnsave }: SavedMarkRowProps) {
  const { mark } = item;
  const meta = categoryMeta(mark.category);
  const photo = mediaSource(mark.photo_url);
  const from = item.source === 'reel' ? 'Saved from a Reel' : 'Saved from the map';
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} accessibilityLabel={`Open ${mark.name}`} style={styles.row}>
      {photo ? (
        <Image source={photo} style={styles.photo} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.photo, styles.fallback, { backgroundColor: meta.color }]}>
          <Icon name={meta.icon} size={22} color={colors.white} />
        </View>
      )}
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {mark.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {meta.label} · {from} · {ago(item.saved_at)}
        </Text>
        {item.note ? (
          <Text style={styles.sub} numberOfLines={1}>
            {item.note}
          </Text>
        ) : null}
      </View>
      <IconButton name="bookmark" color={colors.blue} accessibilityLabel={`Remove ${mark.name} from saved`} onPress={onUnsave} />
    </PressableScale>
  );
}

export type SavedReelTileProps = {
  item: SavedReelItem;
  onPress: () => void;
};

/** A saved Reel: its frame (bundled or remote), author and caption. */
export function SavedReelTile({ item, onPress }: SavedReelTileProps) {
  const poster = reelPoster(item.thumb_url) ?? reelPoster(item.video_url);
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} accessibilityLabel={`Reel by ${item.author_name}`} style={styles.tile}>
      {poster ? (
        <Image source={poster} style={styles.tileImage} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.tileImage, styles.fallback, { backgroundColor: colors.darkBg }]}>
          <Icon name="reels" size={28} color={colors.darkText} />
        </View>
      )}
      <View style={styles.tileFooter}>
        <Text style={styles.tileAuthor} numberOfLines={1}>
          {item.author_name}
        </Text>
        <Text style={styles.tileCaption} numberOfLines={2}>
          {item.caption}
        </Text>
      </View>
    </PressableScale>
  );
}

const TILE_W = 132;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  photo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.surface },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typeScale.name },
  sub: { ...typeScale.meta },
  tile: { width: TILE_W, gap: spacing.xs },
  tileImage: { width: TILE_W, height: TILE_W * 1.6, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden' },
  tileFooter: { gap: 2 },
  tileAuthor: { ...typeScale.label },
  tileCaption: { ...typeScale.meta },
});
