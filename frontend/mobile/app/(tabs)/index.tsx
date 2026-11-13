import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useRouter, useScrollToTop } from 'expo-router';

import { AppHeader } from '@/components/fb/AppHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { AddFriendsCard } from '@/components/fb/feed/AddFriendsCard';
import { ComposerBar } from '@/components/fb/feed/ComposerBar';
import { PeopleYouMayKnow } from '@/components/fb/feed/PeopleYouMayKnow';
import { PostCard } from '@/components/fb/feed/PostCard';
import { ReelsUnit } from '@/components/fb/feed/ReelsUnit';
import { StoriesRow } from '@/components/fb/feed/StoriesRow';
import { FirstRunCard } from '@/components/home/FirstRunCard';
import { MakeMoveChip } from '@/components/home/MakeMoveChip';
import { MovesFeedUnit } from '@/components/home/MovesFeedUnit';
import { MuseCards } from '@/components/home/MuseCard';
import { SectionBand } from '@/components/ui/SectionBand';
import { useFriends } from '@/lib/friends';
import { useHomeFeed, usePeopleYouMayKnow } from '@/lib/homeFeed';
import type { FeedItem, Post } from '@/lib/mock';
import { useFeedStore } from '@/lib/store/feed';
import { useSuggestions } from '@/lib/suggestions';
import { colors } from '@/lib/theme';

const keyExtractor = (item: FeedItem) => item.id;

/** Everything live on Home, fetched again on pull-to-refresh. */
function refreshLive(): Promise<unknown> {
  return Promise.allSettled([
    useHomeFeed.getState().load(),
    useSuggestions.getState().load(),
    usePeopleYouMayKnow.getState().load(),
    useFriends.getState().load(),
  ]);
}

/**
 * Home: the Facebook feed (static mock posts, ARCHITECTURE 6) with live
 * inserts at the top: Make a Move, getting started, Moves from friends with
 * Pull up, and Muse's pending suggestions. People you may know is real
 * (GET /friends/suggestions) and hides itself when empty.
 */
export default function HomeScreen() {
  const router = useRouter();
  const feed = useFeedStore((s) => s.posts);
  const pymk = usePeopleYouMayKnow((s) => s.people);
  // The feed scrolls under the floating liquid-glass tab bar; the last unit still clears it.
  const tabBarHeight = useTabBarHeight();

  const listRef = useRef<FlatList<FeedItem>>(null);
  // Tapping the Home tab while it is focused scrolls the feed back to the top.
  useScrollToTop(listRef);

  // Units and posts closed with X are hidden until the next refresh; the store is left alone.
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void useSuggestions.getState().load();
    void usePeopleYouMayKnow.getState().load();
  }, []);

  const data = useMemo(
    () =>
      feed.filter(
        (item) => !hiddenIds.includes(item.id) && (item.type !== 'pymk' || pymk.length > 0),
      ),
    [feed, hiddenIds, pymk.length],
  );

  const hide = useCallback((id: string) => {
    setHiddenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }, []);

  const hidePost = useCallback((post: Post) => hide(post.id), [hide]);

  const openComposer = useCallback(() => router.push('/post/new'), [router]);
  const openMoveComposer = useCallback(() => router.push('/move/new'), [router]);
  const openReels = useCallback(() => router.navigate('/reels'), [router]);
  const openFriends = useCallback(() => router.push('/friends'), [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshLive();
    } finally {
      // A refresh brings back anything that was hidden with X.
      setHiddenIds([]);
      setRefreshing(false);
    }
  }, []);

  const renderItem = useCallback<ListRenderItem<FeedItem>>(
    ({ item }) => {
      switch (item.type) {
        case 'post':
          return <PostCard post={item} onDismiss={hidePost} />;
        case 'pymk':
          return <PeopleYouMayKnow title={item.title} people={pymk} onDismiss={() => hide(item.id)} />;
        case 'reels-unit':
          return <ReelsUnit title={item.title} onPressReel={openReels} />;
        default:
          return null;
      }
    },
    [hide, hidePost, openReels, pymk],
  );

  const header = useMemo(
    () => (
      <View>
        <ComposerBar onPress={openComposer} />
        <MakeMoveChip onPress={openMoveComposer} />
        <StoriesRow onPressCreate={openComposer} />
        <SectionBand />
        <FirstRunCard />
        <MovesFeedUnit />
        <MuseCards />
        <SectionBand />
      </View>
    ),
    [openComposer, openMoveComposer],
  );

  const hasItems = data.length > 0;
  const footer = useMemo(
    () => (
      <View>
        {hasItems ? <SectionBand /> : null}
        <AddFriendsCard onPress={openFriends} />
      </View>
    ),
    [hasItems, openFriends],
  );

  return (
    <View style={styles.root}>
      <AppHeader onPressPlus={openComposer} />
      <FlatList
        ref={listRef}
        style={styles.list}
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={SectionBand}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
        scrollIndicatorInsets={{ bottom: tabBarHeight }}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textSecondary}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  list: { flex: 1 },
});
