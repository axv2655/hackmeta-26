import { StyleSheet, Text, View } from 'react-native';

import { ReasonLine } from '@/components/common/ReasonLine';
import { IconBadge, Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { categoryMeta } from '@/lib/categories';
import { useMuseSearch } from '@/lib/museSearch';
import { colors } from '@/lib/theme';
import type { MuseSearchPlace, MuseSource } from '@/lib/types';

import { searchStyles } from './searchStyles';

type Props = { places: MuseSearchPlace[]; source: MuseSource };

/** Spots ranked from everyone's ratings. Tapping one drafts a Move there (still held until Send). */
export function MuseSearchPlaces({ places, source }: Props) {
  if (places.length === 0) {
    return (
      <View style={searchStyles.card}>
        <Text style={searchStyles.meta}>Muse didn’t find a spot for that yet.</Text>
      </View>
    );
  }
  const pick = (markId: string) => void useMuseSearch.getState().draftFrom({ mark_id: markId, user_ids: [] });

  return (
    <View style={searchStyles.card}>
      <View style={searchStyles.group}>
        {places.map((p, i) => (
          <PlaceRow key={p.mark_id} place={p} first={i === 0} source={source} onPress={pick} />
        ))}
      </View>
      <Text style={searchStyles.meta}>Tap a spot to draft a Move there.</Text>
    </View>
  );
}

type RowProps = { place: MuseSearchPlace; first: boolean; source: MuseSource; onPress: (markId: string) => void };

function PlaceRow({ place, first, source, onPress }: RowProps) {
  const meta = categoryMeta(place.category);
  const score = typeof place.score === 'number' && Number.isFinite(place.score) ? place.score.toFixed(1) : null;
  return (
    <PressableScale
      onPress={() => onPress(place.mark_id)}
      scaleTo={1}
      style={[searchStyles.row, !first && searchStyles.rowDivider]}
      accessibilityRole="button"
      accessibilityLabel={`${place.name}${score ? `, ${score}` : ''}. Draft a Move here`}
    >
      <IconBadge name={meta.icon} color={meta.color} size={36} />
      <View style={searchStyles.rowText}>
        <Text style={searchStyles.name} numberOfLines={1}>
          {place.name}
        </Text>
        {place.reason ? <ReasonLine text={place.reason} source={source} /> : null}
      </View>
      {score ? (
        <View style={styles.score}>
          <Icon name="star" size={12} color={colors.chipSelectedText} strokeWidth={2.4} />
          <Text style={styles.scoreText}>{score}</Text>
        </View>
      ) : null}
      <Icon name="chevron-right" size={18} color={colors.textSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.chipSelectedBg,
  },
  scoreText: { fontSize: 13, fontWeight: '700', color: colors.chipSelectedText },
});

export default MuseSearchPlaces;
