import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { colors, radius, spacing } from '@/lib/theme';
import type { Circle, PseudoGroup, UserLite } from '@/lib/types';

import { Chip, Face, section } from './Chip';
import { toggleId } from './hooks';

type Props = {
  loading?: boolean;
  circles: Circle[];
  crews: PseudoGroup[];
  friends: UserLite[];
  circleIds: string[];
  userIds: string[];
  onCircles: (ids: string[]) => void;
  onUsers: (ids: string[]) => void;
  sample: boolean;
};

/** "Who": Circles, usual crews and friends. Never public: someone has to be picked. */
export function AudiencePicker({ circles, crews, friends, circleIds, userIds, onCircles, onUsers, sample, loading }: Props) {
  const router = useRouter();

  if (!loading && !sample && circles.length === 0 && friends.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={section.label}>Who</Text>
        <Text style={section.sub}>Moves only go to friends and Circles. Add a friend to share this one.</Text>
        <Button title="Find friends" icon="user-plus" variant="tinted" onPress={() => router.push('/friends')} />
      </View>
    );
  }

  const crewOn = (c: PseudoGroup) => c.members.length > 0 && c.members.every((m) => userIds.includes(m.id));
  const toggleCrew = (c: PseudoGroup) => {
    const ids = c.members.map((m) => m.id);
    onUsers(crewOn(c) ? userIds.filter((id) => !ids.includes(id)) : [...new Set([...userIds, ...ids])]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={section.label}>Who</Text>
      {loading ? <Text style={section.sub}>Loading friends and Circles...</Text> : null}
      <View style={section.wrapRow}>
        {circles.map((c) => (
          <Chip
            key={c.id}
            label={c.fb_group_name ?? `${c.emoji ? `${c.emoji} ` : ''}${c.name}`}
            tag={c.fb_group_name ? 'Group' : undefined}
            icon="users"
            on={circleIds.includes(c.id)}
            onPress={() => onCircles(toggleId(circleIds, c.id))}
          />
        ))}
        {!sample ? <Chip label="New Circle" icon="plus" on={false} onPress={() => router.push('/circles/new')} /> : null}
      </View>
      {crews.length ? (
        <>
          <Text style={styles.sublabel}>Usual crews</Text>
          <View style={section.wrapRow}>
            {crews.map((c) => (
              <Chip key={c.id} label={c.label} small on={crewOn(c)} onPress={() => toggleCrew(c)} />
            ))}
          </View>
        </>
      ) : null}
      {friends.length ? <Text style={styles.sublabel}>Friends</Text> : null}
      <View style={styles.grid}>
        {friends.map((f) => (
          <FriendToggle key={f.id} user={f} on={userIds.includes(f.id)} onPress={() => onUsers(toggleId(userIds, f.id))} />
        ))}
      </View>
    </View>
  );
}

function FriendToggle({ user, on, onPress }: { user: UserLite; on: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={() => {
        selection();
        onPress();
      }}
      style={styles.friend}
      scaleTo={0.92}
      accessibilityLabel={`${on ? 'Remove' : 'Add'} ${user.first_name}`}
      accessibilityState={{ selected: on }}
    >
      <View style={[styles.ring, on && styles.ringOn]}>
        <Face user={user} size={52} />
        {on ? (
          <View style={styles.check}>
            <Icon name="check" size={12} color={colors.white} />
          </View>
        ) : null}
      </View>
      <Text style={styles.friendName} numberOfLines={1}>
        {user.first_name}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  empty: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  sublabel: { ...section.meta, fontWeight: '600', marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  friend: { width: 64, alignItems: 'center', gap: 4 },
  ring: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: colors.transparent },
  ringOn: { borderColor: colors.blue },
  check: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendName: { fontSize: 13, color: colors.text, maxWidth: 64 },
});
