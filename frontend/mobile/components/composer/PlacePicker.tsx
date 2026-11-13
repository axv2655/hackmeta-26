import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { errorMessage } from '@/lib/backend';
import { addPlaceHere, isHere, searchPlaces, type Place } from '@/lib/composer';
import { useLocation } from '@/lib/location';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { Category } from '@/lib/types';

import { Chip, section } from './Chip';
import { useDebouncedQuery, type QueryState } from './hooks';
import { MusePicksRow } from './MusePicksRow';

type Props = {
  loading?: boolean;
  places: Place[];
  place: Place | null;
  onChoose: (p: Place) => void;
  category: Category;
  userIds: string[];
  sample: boolean;
  confirmPlace: boolean;
  onConfirmYes: () => void;
};

/** "Where": nearby places, search, "Add here", Muse picks, and Muse's "Is this X?" check. */
export function PlacePicker({ places, place, onChoose, category, userIds, sample, confirmPlace, onConfirmYes, loading }: Props) {
  const [q, setQ] = useState('');
  const input = useRef<TextInput>(null);
  const query = q.trim();
  const search = useDebouncedQuery(`search:${query}`, () => searchPlaces(query), query.length > 0 && !sample);
  // Re-render when the fix arrives so "· here" stays honest.
  useLocation((s) => s.coords);

  const pick = (p: Place) => {
    onChoose(p);
    setQ('');
    input.current?.blur();
  };

  return (
    <View style={styles.wrap}>
      <Text style={section.label}>Where</Text>
      {confirmPlace && place ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText} numberOfLines={2}>
            Is this {place.name}?
          </Text>
          <Chip label="Yes" small on onPress={onConfirmYes} />
          <Chip label="Change" small on={false} onPress={() => input.current?.focus()} />
        </View>
      ) : null}
      <View style={styles.searchBox}>
        <Icon name="search" size={17} color={colors.textSecondary} />
        <TextInput
          ref={input}
          value={q}
          onChangeText={setQ}
          placeholder="Search places"
          placeholderTextColor={colors.placeholder}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search places"
        />
        {q ? (
          <PressableScale onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={10}>
            <Icon name="x-circle" size={17} color={colors.textSecondary} />
          </PressableScale>
        ) : null}
      </View>
      {query ? (
        <SearchResults query={query} search={search} category={category} sample={sample} onPick={pick} />
      ) : (
        loading && places.length === 0 ? <Text style={section.sub}>Loading nearby places. You can search now.</Text> : <PlaceChips places={places} place={place} onChoose={onChoose} />
      )}
      {!query && !sample && !loading ? <MusePicksRow userIds={userIds} category={category} onPick={pick} /> : null}
    </View>
  );
}

function PlaceChips({ places, place, onChoose }: { places: Place[]; place: Place | null; onChoose: (p: Place) => void }) {
  if (places.length === 0) return <Text style={section.sub}>No places nearby yet. Search for one above.</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={section.chipRow}>
      {places.map((p) => (
        <Chip
          key={p.id}
          label={isHere(p) ? `${p.name} · here` : p.name}
          icon="map-pin"
          on={p.id === place?.id}
          onPress={() => onChoose(p)}
        />
      ))}
    </ScrollView>
  );
}

type ResultsProps = {
  query: string;
  search: QueryState<Place[]>;
  category: Category;
  sample: boolean;
  onPick: (p: Place) => void;
};

function SearchResults({ query, search, category, sample, onPick }: ResultsProps) {
  const permission = useLocation((s) => s.permission);
  const [adding, setAdding] = useState(false);
  const canAdd = permission === 'granted' && !sample;

  async function add() {
    if (!canAdd) return;
    setAdding(true);
    try {
      onPick(await addPlaceHere(query, category));
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setAdding(false);
    }
  }

  const rows = search.data ?? [];
  return (
    <View style={styles.results}>
      {search.loading && rows.length === 0 ? <ActivityIndicator style={styles.spinner} /> : null}
      {search.error ? (
        <PressableScale onPress={search.retry} style={styles.row} accessibilityRole="button">
          <Text style={section.error}>{search.error} · Tap to retry</Text>
        </PressableScale>
      ) : null}
      {!search.loading && !search.error && rows.length === 0 && !sample ? (
        <Text style={[section.sub, styles.row]}>No places match "{query}".</Text>
      ) : null}
      {rows.map((p) => (
        <PressableScale key={p.id} onPress={() => onPick(p)} style={styles.row} accessibilityRole="button">
          <Icon name="map-pin" size={18} color={colors.textSecondary} />
          <View style={styles.flex}>
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
            </Text>
            {p.address ? (
              <Text style={section.meta} numberOfLines={1}>
                {p.address}
              </Text>
            ) : null}
          </View>
        </PressableScale>
      ))}
      <PressableScale
        onPress={add}
        disabled={!canAdd || adding}
        style={[styles.row, !canAdd && styles.dim]}
        accessibilityRole="button"
        accessibilityLabel={`Add ${query} here`}
      >
        <Icon name="plus-circle" size={18} color={canAdd ? colors.blue : colors.textSecondary} />
        <View style={styles.flex}>
          <Text style={[styles.name, canAdd && styles.addText]} numberOfLines={1}>
            {adding ? 'Adding…' : `Add "${query}" here`}
          </Text>
          {!canAdd ? (
            <Text style={section.meta}>{sample ? "You're offline" : 'Turn on location to add a place where you are'}</Text>
          ) : null}
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  flex: { flex: 1 },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tintBg,
  },
  confirmText: { ...typeScale.body, flex: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },
  results: { gap: 2 },
  spinner: { marginVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  name: { ...typeScale.name },
  addText: { color: colors.blue },
  dim: { opacity: 0.7 },
});
