import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenHeader } from '@/components/fb/ScreenHeader';

export type ReelsTopBarProps = {
  /** Default: switch to the Search tab. */
  onPressSearch?: () => void;
  /** Default: open Saved (saved Reels and Saved Marks). */
  onPressSaved?: () => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Dark large header floating over the reel: hamburger and "Reels" at the left,
 * search and Saved (bookmark) at the right, all white. It stays put
 * while reels page underneath; the top gradient on the media keeps it legible.
 */
export function ReelsTopBar({ onPressSearch, onPressSaved, style }: ReelsTopBarProps) {
  const router = useRouter();

  return (
    <View style={[styles.bar, style]}>
      <ScreenHeader
        title="Reels"
        dark
        actions={[
          {
            icon: 'search',
            accessibilityLabel: 'Search reels',
            onPress: onPressSearch ?? (() => router.navigate('/search')),
          },
          {
            icon: 'bookmark',
            accessibilityLabel: 'Saved',
            onPress: onPressSaved ?? (() => router.push('/saved')),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    pointerEvents: 'box-none',
  },
});

export default ReelsTopBar;
