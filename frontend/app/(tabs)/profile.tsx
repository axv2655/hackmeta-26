import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ProfileDetails } from '@/components/fb/profile/ProfileDetails';
import { ProfileFriends } from '@/components/fb/profile/ProfileFriends';
import { ProfileHero } from '@/components/fb/profile/ProfileHero';
import { ProfileMediaGrid } from '@/components/fb/profile/ProfileMediaGrid';
import { ProfilePosts } from '@/components/fb/profile/ProfilePosts';
import { ProfileTabs } from '@/components/fb/profile/ProfileTabs';
import {
  profile,
  profilePhotos,
  profileReels,
  type ProfileTabKey,
} from '@/components/fb/profile/data';
import { ScreenHeader, type HeaderAction } from '@/components/fb/ScreenHeader';
import { SectionBand } from '@/components/ui/SectionBand';
import { aspect, currentUser, friends } from '@/lib/mock';
import { colors, spacing } from '@/lib/theme';

const HEADER_ACTIONS: HeaderAction[] = [
  { icon: 'search', accessibilityLabel: 'Search profile', size: 24 },
  { icon: 'pencil', accessibilityLabel: 'Edit profile', size: 22 },
];

const REEL_TILES = profileReels.map((reel) => ({ id: reel.id, image: reel.poster, viewCount: reel.viewCount }));

export default function ProfileScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<ProfileTabKey>('posts');

  const openComposer = useCallback(() => router.push('/post/new'), [router]);

  return (
    <View style={styles.root}>
      <ScreenHeader title={currentUser.name} variant="compact" hideBack actions={HEADER_ACTIONS} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ProfileHero user={currentUser} friendCount={profile.friendCount} bio={profile.bio} />
        <SectionBand />
        <ProfileTabs active={tab} onChange={setTab} />

        {tab === 'posts' ? (
          <>
            <ProfileDetails />
            <SectionBand />
            <ProfileFriends friends={friends} friendCount={profile.friendCount} />
            <SectionBand />
            <ProfilePosts user={currentUser} onPressCompose={openComposer} />
            <SectionBand />
          </>
        ) : tab === 'photos' ? (
          <ProfileMediaGrid tiles={profilePhotos} itemLabel="Photo" />
        ) : (
          <ProfileMediaGrid tiles={REEL_TILES} tileAspect={aspect.reel} itemLabel="Reel" />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xxl },
});
