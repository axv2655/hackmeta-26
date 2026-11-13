import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useFriends } from '@/lib/friends';
import { layout, spacing, type as typeScale } from '@/lib/theme';

import { PersonRow } from './PersonRow';
import { SectionEmpty, SectionHeader, SectionLoading } from './Section';

/**
 * "People you may know" from `GET /friends/suggestions` (friends of friends
 * first). The caller loads it with `useFriends.loadSuggestions()` on focus.
 */
export function SuggestionsSection() {
  const people = useFriends((s) => s.suggestions);
  const status = useFriends((s) => s.suggestionsStatus);

  return (
    <>
      <SectionHeader title="People you may know" />
      {people.map((p) => (
        <PersonRow key={p.user.id} person={p} />
      ))}
      {people.length === 0 && (status === 'loading' || status === 'idle') ? (
        <SectionLoading label="Loading people you may know" />
      ) : null}
      {people.length === 0 && status === 'ready' ? (
        <SectionEmpty text="No one new to suggest right now. Try searching by name." />
      ) : null}
      {status === 'error' && people.length === 0 ? (
        <View style={styles.error}>
          <Text style={styles.muted}>Couldn't load suggestions.</Text>
          <Button
            title="Try again"
            size="sm"
            variant="secondary"
            onPress={() => void useFriends.getState().loadSuggestions()}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingVertical: spacing.md,
  },
  muted: { ...typeScale.rowSub, flex: 1 },
});
