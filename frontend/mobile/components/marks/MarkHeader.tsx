import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { categoryMeta } from '@/lib/categories';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { MarkDetail } from '@/lib/types';

import { mediaSource } from './media';

export type MarkHeaderProps = {
  mark: MarkDetail;
  saved: boolean;
  onToggleSave: () => void;
};

function ScoreBadge({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'gray' }) {
  const blue = tone === 'blue';
  return (
    <View
      style={[styles.score, { backgroundColor: blue ? colors.chipSelectedBg : colors.surface }]}
      accessible
      accessibilityLabel={`${label} ${value.toFixed(1)}`}
    >
      <Text style={[styles.scoreValue, { color: blue ? colors.chipSelectedText : colors.text }]}>{value.toFixed(1)}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

/** Photo, name, category chip, address, scores and the Save toggle for a Mark. */
export function MarkHeader({ mark, saved, onToggleSave }: MarkHeaderProps) {
  const meta = categoryMeta(mark.category);
  const photo = mediaSource(mark.photo_url);
  return (
    <View>
      {photo ? (
        <Image source={photo} style={styles.photo} contentFit="cover" transition={150} accessibilityLabel={mark.name} />
      ) : (
        <View style={[styles.photo, styles.photoFallback, { backgroundColor: meta.color }]}>
          <Icon name={meta.icon} size={48} color={colors.white} />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} accessibilityRole="header">
          {mark.name}
        </Text>
        <View style={styles.row}>
          <View style={[styles.chip, { borderColor: meta.color }]}>
            <Icon name={meta.icon} size={13} color={meta.color} />
            <Text style={[styles.chipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {mark.price_level ? <Text style={styles.meta}>{'$'.repeat(mark.price_level)}</Text> : null}
        </View>
        {mark.address ? (
          <Text style={styles.meta} numberOfLines={2}>
            {mark.address}
          </Text>
        ) : null}
        {mark.score != null || mark.friends_score != null ? (
          <View style={styles.row}>
            {mark.score != null ? <ScoreBadge label="Your score" value={mark.score} tone="blue" /> : null}
            {mark.friends_score != null ? <ScoreBadge label="Friends" value={mark.friends_score} tone="gray" /> : null}
          </View>
        ) : null}
        {mark.vibe_tags.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {mark.vibe_tags.slice(0, 4).join(' · ')}
          </Text>
        ) : null}
        <Button
          title={saved ? 'Saved' : 'Save'}
          icon={saved ? 'check' : 'bookmark'}
          variant={saved ? 'secondary' : 'tinted'}
          onPress={onToggleSave}
          accessibilityLabel={saved ? `Remove ${mark.name} from saved` : `Save ${mark.name}`}
          style={styles.save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 200, backgroundColor: colors.surface },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  name: { ...typeScale.screenTitle },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { ...typeScale.label, fontSize: 12 },
  meta: { ...typeScale.rowSub },
  score: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm },
  scoreValue: { ...typeScale.name },
  scoreLabel: { ...typeScale.meta },
  save: { alignSelf: 'flex-start', marginTop: spacing.xs },
});

export default MarkHeader;
