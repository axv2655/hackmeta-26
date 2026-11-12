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
import { SectionBand } from '@/components/ui/SectionBand';
import type { FeedItem, Post } from '@/lib/mock';
import { useFeedStore } from '@/lib/store/feed';
import { colors } from '@/lib/theme';

/** How long the pull-to-refresh spinner stays up. Nothing is fetched: the feed is seeded. */
const REFRESH_MS = 900;

const keyExtractor = (item: FeedItem) => item.id;

/** Messenger, "..." and the other controls that have no destination in the mock. */
const noop = () => {};

export default function HomeScreen() {
  const router = useRouter();
  const feed = useFeedStore((s) => s.posts);
  // The feed scrolls under the floating liquid-glass tab bar; the last unit still clears it.
  const tabBarHeight = useTabBarHeight();

  const listRef = useRef<FlatList<FeedItem>>(null);
  // Tapping the Home tab while it is focused scrolls the feed back to the top.
  useScrollToTop(listRef);

  // Units and posts closed with X are hidden for this session only; the store is left alone.
  const [hiddenIds, setHiddenIds] = useState<readonly string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const data = useMemo(
    () => (hiddenIds.length === 0 ? feed : feed.filter((item) => !hiddenIds.includes(item.id))),
    [feed, hiddenIds],
  );

  const hide = useCallback((id: string) => {
    setHiddenIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }, []);

  const hidePost = useCallback((post: Post) => hide(post.id), [hide]);

  const openComposer = useCallback(() => router.push('/post/new'), [router]);
  const openReels = useCallback(() => router.navigate('/reels'), [router]);

  const handleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    setRefreshing(true);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      // A refresh brings back anything that was hidden with X.
      setHiddenIds([]);
      setRefreshing(false);
    }, REFRESH_MS);
  }, []);

  const renderItem = useCallback<ListRenderItem<FeedItem>>(
    ({ item }) => {
      switch (item.type) {
        case 'post':
          return <PostCard post={item} onDismiss={hidePost} />;
        case 'pymk':
          return <PeopleYouMayKnow title={item.title} onDismiss={() => hide(item.id)} />;
        case 'reels-unit':
          return <ReelsUnit title={item.title} onPressReel={openReels} />;
        default:
          return null;
      }
    },
    [hide, hidePost, openReels],
  );

  const header = useMemo(
    () => (
      <View>
        <ComposerBar onPress={openComposer} />
        <StoriesRow onPressCreate={openComposer} />
        <SectionBand />
      </View>
    ),
    [openComposer],
  );

  const hasItems = data.length > 0;
  const footer = useMemo(
    () => (
      <View>
        {hasItems ? <SectionBand /> : null}
        <AddFriendsCard onPress={noop} />
      </View>
    ),
    [hasItems],
  );

  return (
    <View style={styles.root}>
      <AppHeader onPressPlus={openComposer} onPressMessenger={noop} />
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
