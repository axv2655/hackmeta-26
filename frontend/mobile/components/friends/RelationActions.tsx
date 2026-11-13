import { Alert, StyleSheet, View } from 'react-native';

import { Button, type ButtonSize } from '@/components/ui/Button';
import { selection, success } from '@/lib/haptics';
import { useFriends, type Relation } from '@/lib/friends';
import type { UserLite } from '@/lib/types';
import { spacing } from '@/lib/theme';

export type RelationActionsProps = {
  user: UserLite;
  username?: string | null;
  relation: Relation;
  size?: ButtonSize;
  /** Stretch the buttons to fill the row (profile header). */
  stretch?: boolean;
  /** Called after an action succeeds (the profile reloads itself). */
  onChanged?: () => void;
};

/** Ask before ending a friendship. */
export function confirmUnfriend(user: UserLite, onDone?: () => void) {
  Alert.alert(
    `Unfriend ${user.first_name}?`,
    `You'll stop seeing each other's Moves. ${user.first_name} won't be told.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: () => void useFriends.getState().unfriend(user.id).then((ok) => ok && onDone?.()),
      },
    ],
  );
}

/** The friend buttons that fit a relation: Add friend, Cancel request, Confirm + Delete, Friends. */
export function RelationActions({ user, username, relation, size = 'sm', stretch, onChanged }: RelationActionsProps) {
  const { add, confirm, remove } = useFriends.getState();
  const after = (p: Promise<boolean>) => void p.then((ok) => ok && onChanged?.());
  const fill = stretch ? styles.fill : undefined;

  switch (relation) {
    case 'none':
      return (
        <Button
          title="Add friend"
          icon="user-plus"
          size={size}
          style={fill}
          onPress={() => (selection(), after(add(user, username)))}
        />
      );
    case 'outgoing':
      return (
        <Button
          title="Cancel request"
          size={size}
          variant="secondary"
          style={fill}
          accessibilityLabel={`Cancel friend request to ${user.name}`}
          onPress={() => (selection(), after(remove(user.id)))}
        />
      );
    case 'incoming':
      return (
        <View style={[styles.pair, stretch ? styles.fillRow : null]}>
          <Button title="Confirm" size={size} style={fill} onPress={() => (success(), after(confirm(user, username)))} />
          <Button
            title="Delete"
            size={size}
            variant="secondary"
            style={fill}
            accessibilityLabel={`Delete friend request from ${user.name}`}
            onPress={() => after(remove(user.id))}
          />
        </View>
      );
    case 'friend':
      return (
        <Button
          title="Friends"
          icon="user-check"
          size={size}
          variant="secondary"
          style={fill}
          accessibilityLabel={`Friends with ${user.name}. Unfriend`}
          onPress={() => confirmUnfriend(user, onChanged)}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: spacing.xs },
  fillRow: { flex: 1 },
  fill: { flex: 1 },
});
