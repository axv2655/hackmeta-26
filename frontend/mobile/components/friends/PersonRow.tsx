import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { selection, success } from '@/lib/haptics';
import { useFriends, type Person } from '@/lib/friends';
import { colors, spacing } from '@/lib/theme';

import { PersonAvatar } from './PersonAvatar';

/** A person with the one friend action that fits: Add, Requested, Confirm, Friends. */
export function PersonRow({ person, subtitle }: { person: Person; subtitle?: string }) {
  const relation = useFriends((s) => s.relations[person.user.id] ?? person.relation);
  const { add, confirm, remove, unfriend } = useFriends.getState();
  const { user } = person;
  const detail = subtitle ?? (person.username ? `@${person.username}` : undefined);

  const askUnfriend = () =>
    Alert.alert(`Unfriend ${user.first_name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unfriend', style: 'destructive', onPress: () => void unfriend(user.id) },
    ]);

  return (
    <View style={styles.row}>
      <PersonAvatar user={user} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {user.name}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      {relation === 'none' ? (
        <Button title="Add friend" icon="user-plus" size="sm" onPress={() => (selection(), void add(user))} />
      ) : relation === 'outgoing' ? (
        <Button title="Requested" size="sm" variant="secondary" onPress={() => (selection(), void remove(user.id))} />
      ) : relation === 'incoming' ? (
        <View style={styles.pair}>
          <Button title="Confirm" size="sm" onPress={() => (success(), void confirm(user))} />
          <Button title="Delete" size="sm" variant="secondary" onPress={() => void remove(user.id)} />
        </View>
      ) : relation === 'friend' ? (
        <Button title="Friends" icon="user-check" size="sm" variant="secondary" onPress={askUnfriend} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  pair: { flexDirection: 'row', gap: spacing.xs },
});
