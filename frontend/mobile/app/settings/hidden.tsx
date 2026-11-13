import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { HideFriendSheet } from '@/components/settings/HideFriendSheet';
import { Button } from '@/components/ui/Button';
import { useFriends } from '@/lib/friends';
import { useHiddenFrom } from '@/lib/settings';
import { colors, hairline, radius, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { UserLite } from '@/lib/types';

function confirmHide(user: UserLite, onYes: () => void): void {
  Alert.alert(
    `Hide your Moves from ${user.first_name}?`,
    `${user.first_name} won't see your Moves or your ghost, and won't be told. This also removes ${user.first_name} as a friend.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hide', style: 'destructive', onPress: onYes },
    ],
  );
}

function HiddenRow({ user, divider, onUnhide }: { user: UserLite; divider: boolean; onUnhide: () => void }) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <PersonAvatar user={user} size={44} />
      <Text style={styles.name} numberOfLines={1}>
        {user.name}
      </Text>
      <Button title="Unhide" size="sm" variant="secondary" onPress={onUnhide} />
    </View>
  );
}

export default function HiddenFromScreen() {
  const router = useRouter();
  const { people, status, error, load, hide, unhide } = useHiddenFrom();
  const [picking, setPicking] = useState(false);
  const hiddenIds = useMemo(() => new Set(people.map((p) => p.id)), [people]);

  useEffect(() => {
    void load();
  }, [load]);

  const onPick = (user: UserLite) =>
    confirmHide(user, async () => {
      setPicking(false);
      if (await hide(user)) {
        void useFriends.getState().load();
        toast(`Your Moves are hidden from ${user.first_name}`);
      }
    });

  const onUnhide = async (user: UserLite) => {
    if (!(await unhide(user))) return;
    toast(`Unhidden. Add ${user.first_name} as a friend again to share Moves.`, {
      label: 'Profile',
      onPress: () => router.push(`/user/${user.id}` as Href),
    });
  };

  const addButton = <Button title="Hide from someone" icon="eye-off" onPress={() => setPicking(true)} />;

  let body;
  if (status === 'idle' || status === 'loading') {
    body = <LoadingState label="Loading" />;
  } else if (status === 'error') {
    body = <ErrorState message={error ?? 'Could not load who is hidden'} onRetry={() => void load()} />;
  } else if (people.length === 0) {
    body = (
      <EmptyState
        icon="eye-off"
        title="Nobody is hidden"
        body="Hide your Moves from anyone, like family."
        action={{ label: 'Hide from someone', onPress: () => setPicking(true) }}
      />
    );
  } else {
    body = (
      <FlatList
        data={people}
        keyExtractor={(u) => u.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.intro}>
              These people never see your Moves or your ghost at a Mark. They aren&apos;t told.
            </Text>
            {addButton}
          </View>
        }
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <View style={[styles.card, index === 0 && styles.cardTop, index === people.length - 1 && styles.cardBottom]}>
            <HiddenRow user={item} divider={index > 0} onUnhide={() => void onUnhide(item)} />
          </View>
        )}
      />
    );
  }

  return (
    <StackScreen title="Hidden from">
      <View style={styles.page}>{body}</View>
      <HideFriendSheet visible={picking} hiddenIds={hiddenIds} onPick={onPick} onClose={() => setPicking(false)} />
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  header: { gap: spacing.md, paddingVertical: spacing.lg },
  intro: { ...typeScale.rowSub },
  card: { backgroundColor: colors.white },
  cardTop: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cardBottom: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  divider: { ...hairline('Top') },
  name: { ...typeScale.name, flex: 1 },
});
