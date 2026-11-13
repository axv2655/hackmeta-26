import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useIsFocused, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBar } from '@/components/common/OfflineBar';
import { ProfileDemoSections } from '@/components/fb/profile/ProfileDemoSections';
import { ProfileFriendsSection } from '@/components/fb/profile/ProfileFriendsSection';
import { HERO_SHEET_TOP, ProfileHero } from '@/components/fb/profile/ProfileHero';
import { ProfileListCard } from '@/components/fb/profile/ProfileListCard';
import { ProfileMuseCard } from '@/components/fb/profile/ProfileMuseCard';
import { ProfileNoPosts } from '@/components/fb/profile/ProfileNoPosts';
import { PROFILE_BAR_HEIGHT, ProfileTopBar } from '@/components/fb/profile/ProfileTopBar';
import { useProfileExtras } from '@/components/fb/profile/useProfileExtras';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { SectionBand } from '@/components/ui/SectionBand';
import { DEMO } from '@/lib/demo';
import { useFriends } from '@/lib/friends';
import { toUser, useMeUser } from '@/lib/people';
import { useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';

/** Top of the gradient; shown in the pull-down overscroll above the hero. */
const OVERSCROLL_TOP = '#77787C';
/** The bundled sample bio, posts and photos describe this seeded account only. */
const SAMPLE_OWNER = 'u_anish';

export default function ProfileScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarHeight();
  const me = useMeUser();
  const friendRows = useFriends((s) => s.friends);
  const friendsLoaded = useFriends((s) => s.loaded);
  const { taste, list, reloadList } = useProfileExtras();

  const [museVisible, setMuseVisible] = useState(true);
  const [solidBar, setSolidBar] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const solidRef = useRef(false);

  const friends = useMemo(() => friendRows.map((p) => toUser(p.user)), [friendRows]);
  const showSamples = DEMO && me.id === SAMPLE_OWNER;

  useFocusEffect(
    useCallback(() => {
      void useFriends.getState().load();
      void useSession.getState().refreshMe();
    }, []),
  );

  const go = useCallback((href: Href) => router.push(href), [router]);
  const openFriends = useCallback(() => go('/friends'), [go]);
  const openEdit = useCallback(() => go('/profile/edit'), [go]);
  const openMenu = useCallback(() => go('/menu'), [go]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([useFriends.getState().load(), useSession.getState().refreshMe(), reloadList()]);
    setRefreshing(false);
  }, [reloadList]);

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.white}
            progressViewOffset={insets.top + PROFILE_BAR_HEIGHT}
          />
        }
      >
        <ProfileHero
          user={me}
          friendCount={friends.length}
          topInset={insets.top + PROFILE_BAR_HEIGHT}
          commonFriends={friends}
          onPressEditProfile={openEdit}
          onPressFriends={openFriends}
          onPressCommonFriends={openFriends}
        />

        <OfflineBar />

        {museVisible && taste ? <ProfileMuseCard taste={taste} onDismiss={dismissMuse} style={styles.muse} /> : null}

        <ProfileListCard
          status={list.status}
          rows={list.data}
          error={list.error}
          onOpen={() => go('/leaderboards')}
          onRetry={() => void reloadList()}
        />
        <SectionBand />
        <ProfileFriendsSection
          friends={friends}
          loaded={friendsLoaded}
          onPressFriend={(f) => go(`/user/${encodeURIComponent(f.id)}` as Href)}
          onPressSeeAll={openFriends}
          onPressFind={openFriends}
        />
        <SectionBand />
        {showSamples ? (
          <ProfileDemoSections user={me} onPressCompose={() => go('/post/new')} />
        ) : (
          <ProfileNoPosts onPressMakeMove={() => go('/move/new')} />
        )}
      </ScrollView>

      <ProfileTopBar
        topInset={insets.top}
        solid={solidBar}
        title={me.name}
        avatar={me.avatar}
        onPressMenu={openMenu}
        onPressEdit={openEdit}
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
