import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { ToggleRow } from '@/components/settings/SettingsRow';
import { useAutojoin, useSettingsFriends } from '@/lib/settings';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Friend } from '@/lib/types';

function Intro({ count }: { count: number }) {
  return (
    <View style={styles.header}>
      <Text style={styles.intro}>
        When you&apos;re with these people, you&apos;re added to their Move without a prompt.
      </Text>
      <Text style={styles.count}>
        {count === 0 ? 'Nobody yet. Everyone else gets a one-tap prompt.' : `${count} on your list`}
      </Text>
    </View>
  );
}

export default function AutojoinScreen() {
  const router = useRouter();
  const friends = useSettingsFriends();
  const autojoin = useAutojoin();
  const onIds = useMemo(() => new Set(autojoin.people.map((p) => p.id)), [autojoin.people]);

  const loadAll = useCallback(() => {
    void useSettingsFriends.getState().load();
    void useAutojoin.getState().load();
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loading = [friends.status, autojoin.status].some((s) => s === 'idle' || s === 'loading');
  const error = friends.status === 'error' ? friends.error : autojoin.status === 'error' ? autojoin.error : null;

  let body;
  if (error) {
    body = <ErrorState message={error} onRetry={loadAll} />;
  } else if (loading) {
    body = <LoadingState label="Loading friends" />;
  } else if (friends.friends.length === 0) {
    body = (
      <EmptyState
        icon="user-check"
        title="No friends yet"
        body="Add friends, then choose whose Moves you join without a prompt."
        action={{ label: 'Find friends', onPress: () => router.push('/friends' as Href) }}
      />
    );
  } else {
    const rows = friends.friends;
    body = (
      <FlatList
        data={rows}
        keyExtractor={(f) => f.user.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadAll} />}
        ListHeaderComponent={<Intro count={onIds.size} />}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }: { item: Friend; index: number }) => (
          <View style={[styles.card, index === 0 && styles.cardTop, index === rows.length - 1 && styles.cardBottom]}>
            <ToggleRow
              divider={index > 0}
              left={<PersonAvatar user={item.user} size={40} />}
              title={item.user.name}
              subtitle={item.tier === 'close' ? 'Close friend' : undefined}
              value={onIds.has(item.user.id)}
              onValueChange={(on) => void autojoin.toggle(item.user, on)}
            />
          </View>
        )}
      />
    );
  }

  return (
    <StackScreen title="Auto-join">
      <View style={styles.page}>{body}</View>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: spacing.xs, paddingVertical: spacing.lg },
  intro: { ...typeScale.body },
  count: { ...typeScale.meta },
  card: { backgroundColor: colors.white, overflow: 'hidden' },
  cardTop: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cardBottom: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
});
