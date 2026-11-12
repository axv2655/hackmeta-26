import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ReelItem, ReelsTopBar } from '@/components/fb/reels';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { reels, type Reel } from '@/lib/mock';
import { colors } from '@/lib/theme';

type Size = { width: number; height: number };

const keyExtractor = (reel: Reel) => reel.id;

// On web the pager is CSS scroll snapping, and only mounted rows are snap
// points. The list is short, so mount every page there instead of windowing.
const WINDOWED = Platform.OS !== 'web';
const INITIAL_PAGES = WINDOWED ? 2 : reels.length;
const WINDOW_SIZE = WINDOWED ? 3 : reels.length * 2 + 1;

/**
 * Reels tab: a full-screen vertical pager, one reel per viewport. The viewport
 * is whatever is left above the tab bar; it is estimated from the window for
 * the first frame and then measured, so paging stays exact on web too.
 */
export default function ReelsScreen() {
  const window = useWindowDimensions();
  const tabBarHeight = useTabBarHeight();
  const focused = useIsFocused();

  const [measured, setMeasured] = useState<Size | null>(null);
  const width = measured?.width ?? window.width;
  const height = measured?.height ?? Math.max(1, window.height - tabBarHeight);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const listRef = useRef<FlatList<Reel>>(null);

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

  // Fires per scroll frame but only commits to React when the page actually changes.
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(event.nativeEvent.contentOffset.y / height);
      const index = Math.min(Math.max(raw, 0), reels.length - 1);
      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActiveIndex(index);
      }
    },
    [height],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<Reel> | null | undefined, index: number) => ({ length: height, offset: height * index, index }),
    [height],
  );

  // The place chip is where the Moves feature will attach (open the place, start a move).
  const onPressPlace = useCallback((_reel: Reel) => {}, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Reel>) => (
      <ReelItem
        reel={item}
        index={index}
        width={width}
        height={height}
        active={focused && index === activeIndex}
        onPressPlace={onPressPlace}
      />
    ),
    [activeIndex, focused, height, onPressPlace, width],
  );

  return (
    <View style={styles.root} onLayout={onLayout}>
      {focused ? <StatusBar style="light" /> : null}
      <FlatList
        ref={listRef}
        data={reels}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={`${activeIndex}:${focused}`}
        getItemLayout={getItemLayout}
        style={styles.list}
        pagingEnabled
        decelerationRate="fast"
        bounces={false}
        overScrollMode="never"
        scrollsToTop={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={INITIAL_PAGES}
        maxToRenderPerBatch={INITIAL_PAGES}
        windowSize={WINDOW_SIZE}
        removeClippedSubviews={false}
      />
      <ReelsTopBar />
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
});
