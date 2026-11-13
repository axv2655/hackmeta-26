import { StyleSheet, Switch, Text, View } from 'react-native';

import { ReasonLine } from '@/components/common/ReasonLine';
import { Avatar } from '@/components/ui/Avatar';
import { toUser } from '@/lib/people';
import { colors, spacing, type as typeScale } from '@/lib/theme';
import type { MoveDraft, MuseSource, UserLite } from '@/lib/types';

export type Invitee = { user: UserLite; reason: string | null; source: MuseSource | undefined };

/**
 * Who Muse wants to tell: its notify picks (with a reason each), else the
 * draft's people looked up by id. Ids with no known user are skipped.
 */
export function inviteesFrom(draft: MoveDraft | null, known: UserLite[]): Invitee[] {
  if (!draft) return [];
  if (draft.notify.length) {
    return draft.notify.map((p) => ({ user: p.user, reason: p.reason || null, source: p.source }));
  }
  return draft.user_ids
    .map((id) => known.find((u) => u.id === id))
    .filter((u): u is UserLite => Boolean(u))
    .map((user) => ({ user, reason: null, source: undefined }));
}

export type InviteeListProps = {
  invitees: Invitee[];
  selected: ReadonlySet<string>;
  onToggle: (userId: string, on: boolean) => void;
};

/** One row per invitee: avatar, name, Muse's reason, and a toggle (all on by default). */
export function InviteeList({ invitees, selected, onToggle }: InviteeListProps) {
  return (
    <View style={styles.list}>
      <Text style={styles.heading}>Who hears about it</Text>
      {invitees.map(({ user, reason, source }) => (
        <View key={user.id} style={styles.row}>
          <Avatar source={toUser(user).avatar} size={40} />
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {user.name}
            </Text>
            {reason ? <ReasonLine text={reason} source={source} /> : null}
          </View>
          <Switch
            value={selected.has(user.id)}
            onValueChange={(on) => onToggle(user.id, on)}
            trackColor={{ true: colors.blue, false: colors.grayButton }}
            accessibilityLabel={`Tell ${user.first_name}`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  heading: { ...typeScale.sectionTitle },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typeScale.name },
});

export default InviteeList;
