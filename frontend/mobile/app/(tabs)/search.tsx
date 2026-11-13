import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { PersonRow } from '@/components/friends/PersonRow';
import { SuggestionsSection } from '@/components/friends/SuggestionsSection';
import { SectionHeader } from '@/components/friends/Section';
import { usePeopleSearch } from '@/components/friends/usePeopleSearch';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { mutualLabel, useFriends } from '@/lib/friends';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

/**
 * Find people by name or @username and add them. With nothing typed: your
 * friend requests and People you may know. Backed by `GET /users/search` and
 * `GET /friends/suggestions`.
 */
export default function SearchScreen() {
  const tabBarHeight = useTabBarHeight();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const search = usePeopleSearch(q);

  useFocusEffect(
    useCallback(() => {
      void useFriends.getState().load();
      void useFriends.getState().loadSuggestions();
    }, []),
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title="Search" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.field}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people by name or @username"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus={focus === '1'}
            accessibilityLabel="Search people"
          />
          {search.searching ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
        </View>
        {q ? <SearchResults q={q} {...search} /> : <StartPage />}
      </ScrollView>
    </View>
  );
}

function SearchResults({ q, results, searching, error, retry }: { q: string } & ReturnType<typeof usePeopleSearch>) {
  if (error && !results) return <ErrorState message={error} onRetry={retry} />;
  // First search in flight: the spinner in the field is the loading state.
  if (!results) return null;
  return (
    <>
      <SectionHeader title="People" />
      {results.map((p) => (
        <PersonRow key={p.user.id} person={p} />
      ))}
      {results.length === 0 && !searching ? (
        <EmptyState icon="search" title={`No one called "${q}"`} body="Check the spelling, or try their @username." />
      ) : null}
      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.muted}>{error}</Text>
          <Button title="Try again" size="sm" variant="secondary" onPress={retry} />
        </View>
      ) : null}
    </>
  );
}

/** Nothing typed: requests, a nudge when you have no friends, People you may know. */
function StartPage() {
  const router = useRouter();
  const incoming = useFriends((s) => s.incoming);
  const friendCount = useFriends((s) => s.friends.length);
  const status = useFriends((s) => s.status);
  const loaded = useFriends((s) => s.loaded);
  const error = useFriends((s) => s.error);

  return (
    <>
      {incoming.length > 0 ? (
        <>
          <SectionHeader title="Friend requests" count={incoming.length} />
          {incoming.map((p) => (
            <PersonRow key={p.user.id} person={p} subtitle={mutualLabel(p.mutual_count) ?? 'Wants to be friends'} />
          ))}
        </>
      ) : null}
      {loaded && status === 'ready' && friendCount === 0 ? (
        <EmptyState
          icon="users"
          title="Find people you know"
          body="Search by name or @username. Friends see each other's Moves and can pull up."
        />
      ) : null}
      {loaded && status === 'error' && friendCount === 0 && error ? (
        <View style={styles.inlineError}>
          <Text style={styles.muted}>{error}</Text>
          <Button title="Try again" size="sm" variant="secondary" onPress={() => void useFriends.getState().load()} />
        </View>
      ) : null}
      {friendCount > 0 ? (
        <SectionHeader
          title="Your friends"
          count={friendCount}
          right={<Button title="See all" size="sm" variant="tinted" onPress={() => router.push('/friends')} />}
        />
      ) : null}
      <SuggestionsSection />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingTop: spacing.xs },
  field: {
    height: 44,
    marginHorizontal: layout.gutter,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { ...typeScale.row, flex: 1, height: 44, paddingVertical: 0 },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingVertical: spacing.md,
  },
  muted: { ...typeScale.rowSub, flex: 1 },
});
