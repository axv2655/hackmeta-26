import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { UserLite } from '@/lib/types';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

import type { FriendList } from './useFriendList';

type Props = {
  list: FriendList;
  selected: Record<string, true>;
  onToggle: (user: UserLite) => void;
  /** Shown when you have no friends yet, e.g. a "Find friends" action. */
  onFindFriends?: () => void;
};

function Row({ user, on, onPress }: { user: UserLite; on: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={user.name}
    >
      <PersonAvatar user={user} size={40} />
      <Text style={styles.name} numberOfLines={1}>
        {user.name}
      </Text>
      <View style={[styles.check, on && styles.checkOn]}>
        {on ? <Icon name="check" size={16} color={colors.white} strokeWidth={3} /> : null}
      </View>
    </PressableScale>
  );
}

/** Friends with a search box and a check per person. Only friends can be in a Circle. */
export function MemberPicker({ list, selected, onToggle, onFindFriends }: Props) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? list.friends.filter((f) => f.name.toLowerCase().includes(needle)) : list.friends;
  }, [list.friends, q]);

  if (list.status === 'loading') return <LoadingState label="Loading friends" style={styles.state} />;
  if (list.status === 'error') return <ErrorState message={list.error ?? 'Could not load friends'} onRetry={list.reload} style={styles.state} />;
  if (!list.friends.length) {
    return (
      <EmptyState
        icon="user-plus"
        title="No friends yet"
        body="Only friends can be in a Circle. Add a few first."
        action={onFindFriends ? { label: 'Find friends', onPress: onFindFriends } : undefined}
        style={styles.state}
      />
    );
  }

  return (
    <View>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.placeholder} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search friends"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          autoCorrect={false}
          accessibilityLabel="Search friends"
        />
      </View>
      {shown.length ? (
        shown.map((u) => <Row key={u.id} user={u} on={!!selected[u.id]} onPress={() => onToggle(u)} />)
      ) : (
        <Text style={styles.none}>No friends match "{q.trim()}"</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 0, paddingVertical: spacing.xxl },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  name: { ...typeScale.name, flex: 1 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  none: { ...typeScale.rowSub, textAlign: 'center', padding: spacing.lg },
});
