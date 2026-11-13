import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui/Icon';
import { IconButton, type IconButtonVariant } from '@/components/ui/IconButton';
import { colors, hairlineWidth, layout, type as typeScale } from '@/lib/theme';

export type HeaderAction = {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  /** Put the glyph on a 36pt gray circle. Default false (flat, like the Home header). Wins over `variant`. */
  background?: boolean;
  /**
   * 'flat' (default) = bare glyph; 'outline' = glyph inside a thin outline circle (the "more" button);
   * 'filled' = solid black circle look (Messenger; other glyphs are knocked out of a black circle).
   */
  variant?: IconButtonVariant;
  /** Red count badge. */
  badge?: number;
  /** Glyph size. Defaults: flat 26 (28 in the large header), outline 16, filled 26 (Messenger) / 16, gray circle 20. */
  size?: number;
};

const CIRCLE_SIZE = 28;

function defaultActionSize(action: HeaderAction, large: boolean): number {
  if (action.background) return 20;
  switch (action.variant) {
    case 'outline':
      return 16;
    case 'filled':
      return action.icon === 'messenger' ? 26 : 16;
    default:
      return large ? 28 : 26;
  }
}

export type ScreenHeaderProps = {
  title: string;
  /**
   * 'large'   = hamburger + left-aligned heavy large title (tab roots: Notifications, Reels, Moves, Search).
   * 'compact' = back button, centered 17pt semibold title, hairline underneath (pushed screens and modals).
   * Default 'large'.
   */
  variant?: 'large' | 'compact';
  /** Icon buttons at the right edge, left to right. */
  actions?: HeaderAction[];
  /** Custom right-side content (a text button such as "Post"). Rendered after `actions`. */
  right?: ReactNode;
  /** Compact only: icon for the leading button. Default 'chevron-left'; use 'close' for modals. */
  backIcon?: 'chevron-left' | 'close';
  /** Compact only: defaults to `router.back()` (or `router.replace('/')` when there is no history). */
  onBack?: () => void;
  /** Compact only: hide the leading button. */
  hideBack?: boolean;
  /** Large only: custom element left of the title (rendered after the hamburger). */
  left?: ReactNode;
  /** Large only: hamburger at the far left that opens the Menu screen. Default true. */
  showMenu?: boolean;
  /** Large only: hamburger handler. Defaults to `router.push('/menu')`. */
  onPressMenu?: () => void;
  /** Bottom hairline. Default: true for compact, false for large. */
  border?: boolean;
  /** Add the top safe-area inset above the 52pt bar. Default true. */
  safeTop?: boolean;
  /** White-on-black colors for dark screens (Reels). */
  dark?: boolean;
  /** Bar background. Default white ('transparent' when `dark`). */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shared screen header in two shapes: large tab-root title, or compact pushed-screen bar. */
export function ScreenHeader({
  title,
  variant = 'large',
  actions,
  right,
  backIcon = 'chevron-left',
  onBack,
  hideBack = false,
  left,
  showMenu = true,
  onPressMenu,
  border,
  safeTop = true,
  dark = false,
  backgroundColor,
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const fg = dark ? colors.darkText : colors.text;
  const showBorder = border ?? variant === 'compact';

  const handleBack =
    onBack ??
    (() => {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    });

  const large = variant === 'large';

  const actionButtons = actions?.map((action) => (
    <IconButton
      key={action.accessibilityLabel}
      name={action.icon}
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      background={action.background}
      backgroundColor={dark ? 'rgba(255,255,255,0.16)' : undefined}
      variant={action.variant}
      circleSize={CIRCLE_SIZE}
      knockoutColor={dark ? colors.black : colors.white}
      badge={action.badge}
      size={action.size ?? defaultActionSize(action, large)}
      color={fg}
    />
  ));

  return (
    <View
      style={[
        {
          paddingTop: safeTop ? insets.top : 0,
          backgroundColor: backgroundColor ?? (dark ? colors.transparent : colors.white),
        },
        showBorder && {
          borderBottomWidth: hairlineWidth,
          borderBottomColor: dark ? colors.darkHairline : colors.hairline,
        },
        style,
      ]}
    >
      {large ? (
        <View style={[styles.largeBar, showMenu && styles.largeBarWithMenu]}>
          {showMenu ? (
            <IconButton
              name="menu"
              size={28}
              color={fg}
              accessibilityLabel="Menu"
              onPress={onPressMenu ?? (() => router.push('/menu'))}
            />
          ) : null}
          {left}
          <Text style={[styles.largeTitle, { color: fg }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <View style={[styles.actions, right != null && styles.customRightLarge]}>
            {actionButtons}
            {right}
          </View>
        </View>
      ) : (
        <View style={styles.compactBar}>
          <View style={styles.compactTitleWrap}>
            <Text style={[styles.compactTitle, { color: fg }]} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          </View>
          <View style={styles.side}>
            {hideBack ? null : (
              <IconButton
                name={backIcon}
                size={backIcon === 'close' ? 24 : 26}
                color={fg}
                accessibilityLabel={backIcon === 'close' ? 'Close' : 'Back'}
                onPress={handleBack}
              />
            )}
          </View>
          <View style={[styles.side, styles.actions, right != null && styles.customRight]}>
            {actionButtons}
            {right}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  largeBar: {
    height: layout.largeHeaderHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingRight: 8,
    gap: 10,
  },
  // The hamburger's 44pt target supplies the left inset; its bars line up with the 12pt gutter.
  largeBarWithMenu: { paddingLeft: 0, gap: 2 },
  largeTitle: { ...typeScale.largeTitle, flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  compactBar: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  // Absolutely centered so the title stays put whatever sits on either side.
  compactTitleWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 96,
    pointerEvents: 'none',
  },
  compactTitle: { ...typeScale.headerTitle },
  side: { minWidth: layout.hitTarget, flexDirection: 'row', alignItems: 'center' },
  // Custom right content (text buttons) lines up with the 12pt page gutter.
  customRight: { paddingRight: layout.gutter - 4 },
  customRightLarge: { paddingRight: layout.gutter - 8 },
});

export default ScreenHeader;
