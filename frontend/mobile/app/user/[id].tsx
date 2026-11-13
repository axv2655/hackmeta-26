import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { ProfileHeader } from '@/components/friends/ProfileHeader';
import { HideMovesRow, MutualFriends, ProfileMoves } from '@/components/friends/ProfileSections';
import { useProfile } from '@/components/friends/useProfile';
import { useFriends } from '@/lib/friends';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { UserLite } from '@/lib/types';
import { spacing } from '@/lib/theme';

/** Someone else's profile: who they are, how you're connected, their live Moves. */
export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useSession((s) => s.userId);
  const { profile, status, error, reload } = useProfile(id);
  const [refreshing, setRefreshing] = useState(false);
  const isSelf = !!id && (id === myId || profile?.relation === 'self');

  useEffect(() => {
    if (isSelf) router.replace('/profile');
  }, [isSelf, router]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/friends');
  }, [router]);

  const askHide = useCallback(
    (user: UserLite) => {
      const first = user.first_name;
      Alert.alert(
        `Hide your Moves from ${first}?`,
        `${first} won't see any of your Moves, and you'll no longer be friends. ${first} won't be told. You can undo this in Settings.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Hide my Moves',
            style: 'destructive',
            onPress: async () => {
              if (!(await useFriends.getState().hide(user.id))) return;
              toast(`Your Moves are hidden from ${first}`);
              leave();
            },
          },
        ],
      );
    },
    [leave],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  const title = profile?.user.name ?? 'Profile';
  if (isSelf || (status === 'loading' && !profile)) {
    return (
      <StackScreen title={title}>
        <LoadingState label="Loading profile" variant="detail" />
      </StackScreen>
    );
  }
  if (status === 'missing') {
    return (
      <StackScreen title="Profile">
        <EmptyState
          icon="lock"
          title="This profile isn't available"
          body="The link may be broken, or this person may have limited who can see them."
          action={{ label: 'Go back', onPress: leave }}
        />
      </StackScreen>
    );
  }
  if (!profile) {
    return (
      <StackScreen title="Profile">
        <ErrorState message={error ?? 'Something went wrong'} onRetry={() => void reload()} />
      </StackScreen>
    );
  }

  return (
    <StackScreen title={title}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <ProfileHeader profile={profile} onChanged={() => void reload()} onHide={() => askHide(profile.user)} />
        <MutualFriends profile={profile} />
        <ProfileMoves profile={profile} />
        <HideMovesRow firstName={profile.user.first_name} onPress={() => askHide(profile.user)} />
      </ScrollView>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
});
