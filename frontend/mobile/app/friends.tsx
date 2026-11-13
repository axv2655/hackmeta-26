import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { PersonRow } from '@/components/friends/PersonRow';
import { SectionEmpty, SectionHeader } from '@/components/friends/Section';
import { SuggestionsSection } from '@/components/friends/SuggestionsSection';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { mutualLabel, useFriends, type FriendPerson } from '@/lib/friends';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

const reloadAll = () =>
  Promise.allSettled([useFriends.getState().load(), useFriends.getState().loadSuggestions()]);

/** Second line on a friend row. */
const friendDetail = (p: FriendPerson) => (p.username ? `@${p.username}` : p.tier === 'close' ? 'Close friend' : 'Friend');

/** Friends: requests, close friends, all friends, People you may know. */
export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const status = useFriends((s) => s.status);
  const error = useFriends((s) => s.error);
  const loaded = useFriends((s) => s.loaded);
  const hasData = useFriends((s) => s.friends.length + s.incoming.length + s.outgoing.length > 0);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reloadAll();
    }, []),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }, []);

  let body;
  if (!loaded && !hasData) body = <LoadingState label="Loading friends" />;
  else if (status === 'error' && !hasData) body = <ErrorState message={error ?? 'Something went wrong'} onRetry={() => void reloadAll()} />;
  else body = <FriendsContent />;

  return (
    <StackScreen title="Friends">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <SearchField />
        {body}
      </ScrollView>
    </StackScreen>
  );
}

/** Looks like a search box; opens Search with the keyboard up. */
function SearchField() {
  const router = useRouter();
  return (
    <PressableScale
      style={styles.field}
      scaleTo={1}
      onPress={() => router.push({ pathname: '/search', params: { focus: '1' } })}
      accessibilityRole="search"
      accessibilityLabel="Search people"
    >
      <Icon name="search" size={18} color={colors.textSecondary} />
      <Text style={styles.fieldText}>Search people</Text>
    </PressableScale>
  );
}

function FriendsContent() {
  const router = useRouter();
  const incoming = useFriends((s) => s.incoming);
  const outgoing = useFriends((s) => s.outgoing);
  const friends = useFriends((s) => s.friends);
  const close = friends.filter((p) => p.tier === 'close');

  return (
    <View>
      <SectionHeader title="Friend requests" count={incoming.length || undefined} />
      {incoming.map((p) => (
        <PersonRow key={p.user.id} person={p} subtitle={mutualLabel(p.mutual_count) ?? 'Wants to be friends'} />
      ))}
      {incoming.length === 0 ? <SectionEmpty text="No new friend requests." /> : null}
      {outgoing.length > 0 ? (
        <>
          <SectionHeader title="Sent requests" />
          {outgoing.map((p) => (
            <PersonRow key={p.user.id} person={p} subtitle={mutualLabel(p.mutual_count) ?? 'Request sent'} />
          ))}
        </>
      ) : null}

      <SectionHeader title="Close friends" count={close.length || undefined} />
      {close.map((p) => (
        <PersonRow key={p.user.id} person={p} subtitle={friendDetail(p)} />
      ))}
      {close.length === 0 ? <SectionEmpty text="No close friends yet." /> : null}

      <SectionHeader title="All friends" count={friends.length || undefined} />
      {friends.map((p) => (
        <PersonRow key={p.user.id} person={p} subtitle={friendDetail(p)} />
      ))}
      {friends.length === 0 ? (
        <EmptyState
          icon="users"
          title="No friends yet"
          body="Add friends so you can see each other's Moves."
          action={{ label: 'Find people you know', onPress: () => router.push({ pathname: '/search', params: { focus: '1' } }) }}
        />
      ) : null}

      <SuggestionsSection />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  field: {
    height: 40,
    marginHorizontal: layout.gutter,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldText: { ...typeScale.row, color: colors.placeholder },
});
