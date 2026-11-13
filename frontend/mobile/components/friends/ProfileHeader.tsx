import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { mutualLabel, relationIn, useFriends } from '@/lib/friends';
import type { Profile, UserLite } from '@/lib/types';
import { colors, layout, spacing, type as typeScale } from '@/lib/theme';

import { PersonAvatar } from './PersonAvatar';
import { confirmUnfriend, RelationActions } from './RelationActions';

export type ProfileHeaderProps = {
  profile: Profile;
  onChanged: () => void;
  onHide: () => void;
};

/** Friends ▾: Unfriend or Hide my Moves. */
function openFriendMenu(user: UserLite, onChanged: () => void, onHide: () => void) {
  Alert.alert(`You and ${user.first_name} are friends`, undefined, [
    { text: 'Unfriend', style: 'destructive', onPress: () => confirmUnfriend(user, onChanged) },
    { text: `Hide my Moves from ${user.first_name}`, onPress: onHide },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

function countsLine(p: Profile): string {
  const friends = `${p.friend_count} friend${p.friend_count === 1 ? '' : 's'}`;
  const mutual = mutualLabel(p.mutual_count);
  return mutual ? `${friends} · ${mutual}` : friends;
}

/** Avatar, name, verified line, @username, counts and the relation button. */
export function ProfileHeader({ profile, onChanged, onHide }: ProfileHeaderProps) {
  const { user } = profile;
  const relation = useFriends((s) => relationIn(s, profile));

  return (
    <View style={styles.wrap}>
      <PersonAvatar user={user} size={112} />
      <View style={styles.nameRow}>
        <Text style={styles.name} accessibilityRole="header">
          {user.name}
        </Text>
        {user.fb_verified ? <VerifiedBadge size={20} /> : null}
      </View>
      {user.fb_verified ? <Text style={styles.verified}>Verified with Facebook</Text> : null}
      {profile.username ? <Text style={styles.meta}>@{profile.username}</Text> : null}
      <Text style={styles.meta}>{countsLine(profile)}</Text>
      <View style={styles.actions}>
        {relation === 'friend' ? (
          <Button
            title="Friends ▾"
            icon="user-check"
            variant="secondary"
            style={styles.fill}
            accessibilityLabel={`Friends with ${user.name}. More options`}
            onPress={() => openFriendMenu(user, onChanged, onHide)}
          />
        ) : (
          <RelationActions user={user} username={profile.username} relation={relation} size="md" stretch onChanged={onChanged} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: layout.gutter, paddingTop: spacing.xl, gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  name: { ...typeScale.screenTitle, textAlign: 'center', flexShrink: 1 },
  verified: { ...typeScale.meta, color: colors.blue, fontWeight: '600' },
  meta: { ...typeScale.rowSub, textAlign: 'center' },
  actions: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing.md },
  fill: { flex: 1 },
});
