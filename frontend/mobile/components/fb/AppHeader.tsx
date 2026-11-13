import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/IconButton';
import { colors, layout } from '@/lib/theme';

import { Wordmark } from './brand/Wordmark';

export type AppHeaderProps = {
  /** Hamburger at the far left. Defaults to pushing the Menu screen (/menu). */
  onPressMenu?: () => void;
  /** Defaults to opening the composer at /post/new. */
  onPressPlus?: () => void;
  /**
   * @deprecated Search now lives in the floating tab bar, so the Home header no longer
   * shows a search button. Accepted for compatibility and ignored.
   */
  onPressSearch?: () => void;
  onPressMessenger?: () => void;
  /** Red count on the Messenger icon. 0 / undefined hides it. */
  messengerBadge?: number;
  /** Add the top safe-area inset above the bar. Default true. */
  safeTop?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Home header: hamburger and the blue "facebook" wordmark at the left; the
 * create-post square and the filled Messenger glyph at the right. Plain white,
 * no hairline. Not sticky by itself: render it above the feed list (or as its
 * ListHeaderComponent).
 */
export function AppHeader({
  onPressMenu,
  onPressPlus,
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
        <View style={styles.lead}>
          <IconButton
            name="menu"
            size={28}
            accessibilityLabel="Menu"
            onPress={onPressMenu ?? (() => router.push('/menu'))}
          />
          <Wordmark height={25} />
        </View>
        <View style={styles.actions}>
          <IconButton
            name="plus-square"
            size={30}
            accessibilityLabel="Create a post"
            onPress={onPressPlus ?? (() => router.push('/post/new'))}
          />
          <IconButton
            name="messenger"
            variant="filled"
            size={26}
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
    height: layout.largeHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // The hamburger's 44pt target supplies the left inset; its bars line up with the 12pt gutter.
    paddingLeft: 0,
    paddingRight: 8,
  },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

export default AppHeader;
