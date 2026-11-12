import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { colors, layout } from '@/lib/theme';

import { Wordmark } from './brand/Wordmark';

export type AppHeaderProps = {
  /** Defaults to opening the composer at /post/new. */
  onPressPlus?: () => void;
  onPressSearch?: () => void;
  onPressMessenger?: () => void;
  /** Red count on the Messenger icon. 0 / undefined hides it. */
  messengerBadge?: number;
  /** Add the top safe-area inset above the 52pt bar. Default true. */
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Home header: blue wordmark at the left, flat black plus / search / Messenger
 * icons at the right. 52pt tall plus the status-bar inset. Not sticky by
 * itself: render it above the feed list (or as its ListHeaderComponent).
 */
export function AppHeader({
  onPressPlus,
  onPressSearch,
  onPressMessenger,
  messengerBadge,
  safeTop = true,
  style,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.root, { paddingTop: safeTop ? insets.top : 0 }, style]}>
      <View style={styles.bar}>
        <Wordmark height={25} />
        <View style={styles.actions}>
          <IconButton
            name="plus"
            size={28}
            accessibilityLabel="Create a post"
            onPress={onPressPlus ?? (() => router.push('/post/new'))}
          />
          <IconButton name="search" size={28} accessibilityLabel="Search" onPress={onPressSearch} />
          <IconButton
            name="messenger"
            size={27}
            accessibilityLabel="Messenger"
            onPress={onPressMessenger}
            badge={messengerBadge}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  bar: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: layout.gutter,
    paddingRight: 8,
  },
  actions: { flexDirection: 'row', alignItems: 'center' },
});

export default AppHeader;
