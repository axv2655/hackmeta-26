import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { PersonRow } from '@/components/friends/PersonRow';
import { Icon } from '@/components/ui/Icon';
import { searchPeople, useFriends, type Person } from '@/lib/friends';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

const SETTLE_MS = 250;

/**
 * Find people by name or @username and add them; with nothing typed, your
 * friend requests and friends. Backed by `GET /users/search`.
 */
export default function SearchScreen() {
  const tabBarHeight = useTabBarHeight();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const incoming = useFriends((s) => s.incoming);
  const outgoing = useFriends((s) => s.outgoing);
  const friends = useFriends((s) => s.friends);
  const loaded = useFriends((s) => s.loaded);

  useFocusEffect(
    useCallback(() => {
      void useFriends.getState().load();
    }, []),
  );

  const q = query.trim();
  useEffect(() => {
    if (!q) {
      setResults(null);
      setFailed(false);
      return;
    }
    let live = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPeople(q);
        if (live) {
          setResults(found);
          setFailed(false);
        }
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setSearching(false);
      }
    }, SETTLE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

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
            placeholder="Search people on Facebook"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search people"
          />
          {searching ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
        </View>

        {q ? (
          <>
            <Section title="People" />
            {(results ?? []).map((p) => (
              <PersonRow key={p.user.id} person={p} />
            ))}
            {failed ? <Text style={styles.empty}>Can't search right now. Check your connection.</Text> : null}
            {results && results.length === 0 && !failed ? (
              <Text style={styles.empty}>{`No one called "${q}" yet. Ask them to sign up!`}</Text>
            ) : null}
          </>
        ) : (
          <>
            {incoming.length > 0 ? (
              <>
                <Section title="Friend requests" count={incoming.length} />
                {incoming.map((p) => (
                  <PersonRow key={p.user.id} person={p} subtitle="Wants to be friends" />
                ))}
              </>
            ) : null}
            {outgoing.length > 0 ? (
              <>
                <Section title="Sent requests" />
                {outgoing.map((p) => (
                  <PersonRow key={p.user.id} person={p} />
                ))}
              </>
            ) : null}
            <Section title="Your friends" count={friends.length || undefined} />
            {friends.map((p) => (
              <PersonRow key={p.user.id} person={p} />
            ))}
            {loaded && friends.length === 0 ? (
              <Text style={styles.empty}>Search for people above to add your first friend.</Text>
            ) : null}
            {!loaded ? <ActivityIndicator style={styles.loading} color={colors.textSecondary} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
        {count ? <Text style={styles.count}>{`  ${count}`}</Text> : null}
      </Text>
    </View>
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
  sectionHeader: {
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { ...typeScale.sectionTitle, fontSize: 20, lineHeight: 25, fontWeight: '700' },
  count: { color: colors.badgeRed, fontSize: 17 },
  empty: {
    ...typeScale.rowSub,
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingVertical: spacing.lg,
  },
  loading: { marginTop: spacing.lg },
});
