import { useCallback, useRef, useState } from 'react';
import {
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileDetails } from '@/components/fb/profile/ProfileDetails';
import { ProfileFriends } from '@/components/fb/profile/ProfileFriends';
import { HERO_SHEET_TOP, ProfileHero } from '@/components/fb/profile/ProfileHero';
import { ProfileMediaGrid } from '@/components/fb/profile/ProfileMediaGrid';
import { ProfileMemories } from '@/components/fb/profile/ProfileMemories';
import { ProfileMuseCard } from '@/components/fb/profile/ProfileMuseCard';
import { ProfilePosts } from '@/components/fb/profile/ProfilePosts';
import { ProfileTabs } from '@/components/fb/profile/ProfileTabs';
import { PROFILE_BAR_HEIGHT, ProfileTopBar } from '@/components/fb/profile/ProfileTopBar';
import {
  profile,
  profilePhotos,
  profileReels,
  type ProfileTabKey,
} from '@/components/fb/profile/data';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { SectionBand } from '@/components/ui/SectionBand';
import { aspect, currentUser, friends } from '@/lib/mock';
import { colors, spacing } from '@/lib/theme';

const REEL_TILES = profileReels.map((reel) => ({ id: reel.id, image: reel.poster, viewCount: reel.viewCount }));

/** Top of the gradient; shown in the pull-down overscroll above the hero. */
const OVERSCROLL_TOP = '#77787C';

export default function ProfileScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarHeight();

  const [tab, setTab] = useState<ProfileTabKey>('all');
  const [museVisible, setMuseVisible] = useState(true);
  const [solidBar, setSolidBar] = useState(false);
  const solidRef = useRef(false);

  const openComposer = useCallback(() => router.push('/post/new'), [router]);
  const openMenu = useCallback(() => router.push('/menu'), [router]);
  const openMoves = useCallback(() => router.navigate('/moves'), [router]);

  const dismissMuse = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMuseVisible(false);
  }, []);

  // The bar turns white once the white sheet slides under it. Only re-render on a crossing.
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y > HERO_SHEET_TOP - spacing.sm;
    if (next !== solidRef.current) {
      solidRef.current = next;
      setSolidBar(next);
    }
  }, []);

  return (
    <View style={styles.root}>
      {focused && !solidBar ? <StatusBar style="light" /> : null}

      {/* Gray behind the top half so the pull-down overscroll matches the gradient. */}
      <View style={styles.overscroll} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarSpace + spacing.lg }]}
        contentInsetAdjustmentBehavior="never"
        scrollIndicatorInsets={{ top: insets.top + PROFILE_BAR_HEIGHT, bottom: tabBarSpace }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <ProfileHero
          user={currentUser}
          friendCount={profile.friendCount}
          bio={profile.bio}
          topInset={insets.top + PROFILE_BAR_HEIGHT}
          commonFriends={friends}
        />

        {museVisible ? (
          <ProfileMuseCard onPressTry={openMoves} onDismiss={dismissMuse} style={styles.muse} />
        ) : null}

        <ProfileTabs active={tab} onChange={setTab} />

        {tab === 'all' ? (
          <>
            <ProfileDetails />
            <SectionBand />
            <ProfileFriends friends={friends} friendCount={profile.friendCount} />
            <SectionBand />
            <ProfilePosts user={currentUser} onPressCompose={openComposer} />
          </>
        ) : tab === 'photos' ? (
          <ProfileMediaGrid tiles={profilePhotos} itemLabel="Photo" />
        ) : tab === 'reels' ? (
          <ProfileMediaGrid tiles={REEL_TILES} tileAspect={aspect.reel} itemLabel="Reel" />
        ) : (
          <ProfileMemories />
        )}
      </ScrollView>

      <ProfileTopBar
        topInset={insets.top}
        solid={solidBar}
        title={currentUser.name}
        avatar={currentUser.avatar}
        onPressMenu={openMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  overscroll: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: OVERSCROLL_TOP,
  },
  scroll: { flex: 1 },
  content: { flexGrow: 1, backgroundColor: colors.white },
  muse: { marginTop: spacing.xl },
});
