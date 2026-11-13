import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PressableScale } from '@/components/ui/PressableScale';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { mutualLabel, relationIn, useFriends, type Person } from '@/lib/friends';
import { colors, spacing } from '@/lib/theme';

import { PersonAvatar } from './PersonAvatar';
import { RelationActions } from './RelationActions';

export type PersonRowProps = {
  person: Person;
  /** Overrides the default second line ("3 mutual friends" or @username). */
  subtitle?: string;
};

/** Default second line: mutual friends first, else the @username. */
function detailFor(person: Person): string | undefined {
  return mutualLabel(person.mutual_count) ?? (person.username ? `@${person.username}` : undefined);
}

/**
 * A person with the friend action that fits their relation (Add friend,
 * Cancel request, Confirm/Delete, Friends). The whole row opens their profile.
 */
export function PersonRow({ person, subtitle }: PersonRowProps) {
  const router = useRouter();
  const relation = useFriends((s) => relationIn(s, person));
  const { user } = person;
  const detail = subtitle ?? detailFor(person);

  return (
    <PressableScale
      style={styles.row}
      scaleTo={1}
      pressedOpacity={0.6}
      onPress={() => router.push(`/user/${encodeURIComponent(user.id)}`)}
      accessibilityRole="button"
      accessibilityLabel={`${user.name}${detail ? `, ${detail}` : ''}. Open profile`}
    >
      <PersonAvatar user={user} />
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.name}
          </Text>
          {user.fb_verified ? <VerifiedBadge size={14} /> : null}
        </View>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <RelationActions user={user} username={person.username} relation={relation} size="sm" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  text: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  detail: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
});
