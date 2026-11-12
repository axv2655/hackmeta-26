import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { colors, hairlineWidth, layout, type as typeScale } from '@/lib/theme';

export type HeaderAction = {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  /** Put the glyph on a 36pt gray circle. Default false (flat, like the Home header). */
  background?: boolean;
  /** Red count badge. */
  badge?: number;
  /** Glyph size. Default 26 flat, 20 on a gray circle. */
  size?: number;
};

export type ScreenHeaderProps = {
  title: string;
  /**
   * 'large'   = left-aligned 24pt bold title (tab roots: Notifications, Menu, Moves).
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
  /** Large only: custom element left of the title (an avatar on Menu). */
  left?: ReactNode;
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

  const actionButtons = actions?.map((action) => (
    <IconButton
      key={action.accessibilityLabel}
      name={action.icon}
      accessibilityLabel={action.accessibilityLabel}
      onPress={action.onPress}
      background={action.background}
      backgroundColor={dark ? 'rgba(255,255,255,0.16)' : undefined}
      badge={action.badge}
      size={action.size ?? (action.background ? 20 : 26)}
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
      {variant === 'large' ? (
        <View style={styles.largeBar}>
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
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    paddingRight: 8,
    gap: 10,
  },
  largeTitle: { ...typeScale.screenTitle, flex: 1 },
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
