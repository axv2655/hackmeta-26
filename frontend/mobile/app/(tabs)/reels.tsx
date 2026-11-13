import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { ReelItem, ReelPlaceSheet, ReelsTopBar } from '@/components/fb/reels';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { useReels, type FeedReel } from '@/lib/reels';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';

type Size = { width: number; height: number };

const keyExtractor = (reel: FeedReel) => reel.id;

// On web the pager is CSS scroll snapping, and only mounted rows are snap
// points. The list is short, so mount every page there instead of windowing.
const WINDOWED = Platform.OS !== 'web';

function shareReel(reel: FeedReel) {
  const where = reel.mark ? ` at ${reel.mark.name}` : '';
  Share.share({ message: `${reel.author.name}${where}: ${reel.caption}` }).catch(() => toast("Couldn't open sharing"));
}

/** Loading, error and empty states on a plain page (the dark pager needs reels to draw over). */
function ReelsStatus({ status, error, onRetry }: { status: string; error: string | null; onRetry: () => void }) {
  return (
    <View style={styles.statusPage}>
      <StatusBar style="dark" />
      <ScreenHeader title="Reels" />
      {status === 'error' ? (
        <ErrorState message={error ?? "Couldn't load Reels"} onRetry={onRetry} />
      ) : status === 'ready' ? (
        <EmptyState icon="reels" title="No Reels yet" body="Check back soon." action={{ label: 'Refresh', onPress: onRetry }} />
      ) : (
        <LoadingState label="Loading Reels" variant="spinner" />
      )}
    </View>
  );
}

/**
 * Reels tab: a full-screen vertical pager over `GET /reels`, one reel per
 * viewport. Pages run under the floating glass tab bar; each reel lifts its
 * caption, rail and progress bar above it. The place chip opens the place
 * sheet (friends there and "I'm going", or "Start a Move here").
 */
export default function ReelsScreen() {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const focused = useIsFocused();
  const { items, status, error, sample, load } = useReels();

  const [measured, setMeasured] = useState<Size | null>(null);
  const width = measured?.width ?? window.width;
  const height = measured?.height ?? Math.max(1, window.height);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const listRef = useRef<FlatList<FeedReel>>(null);
  const [placeReel, setPlaceReel] = useState<FeedReel | null>(null);

  // Load on first focus, refresh on every later focus (saves and live Moves change).
  useEffect(() => {
    if (focused) void load();
  }, [focused, load]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: w, height: h } = event.nativeEvent.layout;
    if (w <= 0 || h <= 0) return;
    setMeasured((current) => (current && current.width === w && current.height === h ? current : { width: w, height: h }));
  }, []);

  // A resize (browser window, rotation) changes the page height: realign to the current reel.
  const previousHeight = useRef(height);
  useEffect(() => {
    if (previousHeight.current === height) return;
    previousHeight.current = height;
    listRef.current?.scrollToOffset({ offset: activeIndexRef.current * height, animated: false });
  }, [height]);

  const count = items.length;
  // Fires per scroll frame but only commits to React when the page actually changes.
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(event.nativeEvent.contentOffset.y / height);
      const index = Math.min(Math.max(raw, 0), Math.max(0, count - 1));
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActiveIndex(index);
      }
    },
    [height, count],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<FeedReel> | null | undefined, index: number) => ({ length: height, offset: height * index, index }),
    [height],
  );

  const onPressPlace = useCallback((reel: FeedReel) => {
    if (reel.sample) {
      toast("You're offline");
      return;
    }
    setPlaceReel(reel);
  }, []);
  const onPressMore = useCallback(
    (reel: FeedReel) => {
      if (reel.mark || reel.placeHint) onPressPlace(reel);
      else toast('No place tagged on this reel');
    },
    [onPressPlace],
  );
  const onPressComment = useCallback(() => toast('Comments are off for this reel'), []);
  const closePlace = useCallback(() => setPlaceReel(null), []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<FeedReel>) => (
      <ReelItem
        reel={item}
        index={index}
        width={width}
        height={height}
        bottomInset={tabBarHeight}
        active={focused && index === activeIndex && !placeReel}
        onPressPlace={onPressPlace}
        onPressComment={onPressComment}
        onPressShare={shareReel}
        onPressMore={onPressMore}
      />
    ),
    [activeIndex, focused, height, onPressComment, onPressMore, onPressPlace, placeReel, tabBarHeight, width],
  );

  if (count === 0) {
    return <ReelsStatus status={status} error={error} onRetry={() => void load()} />;
  }

  const pages = WINDOWED ? 2 : count;
  return (
    <View style={styles.root} onLayout={onLayout}>
      {focused ? <StatusBar style="light" /> : null}
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={`${activeIndex}:${focused}:${placeReel?.id ?? ''}`}
        getItemLayout={getItemLayout}
        style={styles.list}
        pagingEnabled
        decelerationRate="fast"
        bounces={false}
        scrollsToTop={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={pages}
        maxToRenderPerBatch={pages}
        windowSize={WINDOWED ? 3 : count * 2 + 1}
        removeClippedSubviews={false}
      />
      <ReelsTopBar />
      {sample ? (
        <View style={[styles.samplePill, { top: insets.top + 56 }]} accessibilityRole="alert">
          <Text style={styles.sampleText}>Sample data · can&apos;t reach Moves</Text>
        </View>
      ) : null}
      <ReelPlaceSheet reel={placeReel} onClose={closePlace} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  list: {
    flex: 1,
    backgroundColor: colors.darkBg,
  },
  statusPage: {
    flex: 1,
    backgroundColor: colors.white,
  },
  samplePill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
    pointerEvents: 'none',
  },
  sampleText: { ...typeScale.meta, color: colors.darkText },
});
