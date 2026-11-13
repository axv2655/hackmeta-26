import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { LoadingState } from '@/components/common/LoadingState';
import type { User } from '@/lib/mock';
import { spacing } from '@/lib/theme';

import { ProfileFriends } from './ProfileFriends';
import { sectionStyles } from './sectionStyles';

export type ProfileFriendsSectionProps = {
  friends: User[];
  /** False until the first `GET /friends` has finished. */
  loaded: boolean;
  onPressFriend: (friend: User) => void;
  onPressSeeAll: () => void;
  onPressFind: () => void;
};

/** Friends grid from your real friend list, with loading and empty states. */
export function ProfileFriendsSection({
  friends,
  loaded,
  onPressFriend,
  onPressSeeAll,
  onPressFind,
}: ProfileFriendsSectionProps) {
  if (friends.length > 0) {
    return (
      <ProfileFriends
        friends={friends}
        friendCount={friends.length}
        onPressFriend={onPressFriend}
        onPressSeeAll={onPressSeeAll}
        onPressFind={onPressFind}
      />
    );
  }
  return (
    <View style={sectionStyles.section}>
      <Text style={sectionStyles.heading} accessibilityRole="header">
        Friends
      </Text>
      {loaded ? (
        <EmptyState
          icon="user-plus"
          title="No friends yet"
          body="Add friends so you can see their Moves and they can see yours."
          action={{ label: 'Find friends', onPress: onPressFind }}
          style={styles.state}
        />
      ) : (
        <LoadingState label="Loading friends" rows={3} style={styles.state} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 0, paddingVertical: spacing.xl },
});
