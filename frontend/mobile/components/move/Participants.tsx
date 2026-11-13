import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { spacing, type as typeScale } from '@/lib/theme';
import type { Participant } from '@/lib/types';

function Group({ title, people, myId }: { title: string; people: Participant[]; myId: string }) {
  const router = useRouter();
  if (people.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={typeScale.label}>
        {title} · {people.length}
      </Text>
      <View style={styles.row}>
        {people.map((p) => (
          <Pressable
            key={p.user.id}
            style={styles.person}
            onPress={() => router.push(`/user/${p.user.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`${p.user.name}'s profile`}
          >
            <PersonAvatar user={p.user} size={48} />
            <Text style={styles.name} numberOfLines={1}>
              {p.user.id === myId ? 'Me' : p.user.first_name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Everyone in the Move, split into "There" and "On the way". People who left are not listed. */
export function Participants({ participants, myId }: { participants: Participant[]; myId: string }) {
  const there = participants.filter((p) => p.status === 'there');
  const going = participants.filter((p) => p.status === 'going');
  return (
    <View style={styles.wrap}>
      <Text style={typeScale.sectionTitle}>Who's in</Text>
      {there.length + going.length === 0 ? (
        <Text style={typeScale.rowSub}>Nobody's here right now.</Text>
      ) : (
        <>
          <Group title="There" people={there} myId={myId} />
          <Group title="On the way" people={going} myId={myId} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  group: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  person: { width: 60, alignItems: 'center', gap: spacing.xs },
  name: { ...typeScale.meta, textAlign: 'center' },
});
