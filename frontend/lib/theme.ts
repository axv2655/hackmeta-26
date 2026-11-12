import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/** Facebook-style palette. Use these tokens instead of hardcoding hex values. */
export const colors = {
  blue: '#0866FF',
  bluePressed: '#0757D9',
  text: '#080809',
  textSecondary: '#65676B',
  placeholder: '#8A8D91',
  white: '#FFFFFF',
  black: '#000000',
  /** Page / card surface gray (link-preview footers, search fields, chips). */
  surface: '#F0F2F5',
  /** Gray button background and gray icon circles. */
  grayButton: '#E4E6EB',
  grayButtonPressed: '#D8DADF',
  /** 6pt band separating feed units. */
  band: '#C9CCD1',
  hairline: '#CED0D4',
  /** Light-blue (tinted) button background + its text color. */
  tintBg: '#EBF5FF',
  tintText: '#0064D1',
  /** Unread notification row tint. */
  unread: '#E7F3FF',
  badgeRed: '#E41E3F',
  love: '#F33E58',
  online: '#31A24C',
  /** Scrims over photos / reels. */
  scrim: 'rgba(0,0,0,0.4)',
  scrimLight: 'rgba(0,0,0,0.15)',
  /** Reels (dark) chrome. */
  darkBg: '#000000',
  darkText: '#FFFFFF',
  darkTextSecondary: 'rgba(255,255,255,0.7)',
  darkHairline: 'rgba(255,255,255,0.16)',
  transparent: 'transparent',
} as const;

export type ColorName = keyof typeof colors;

/** 4pt spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

/** Fixed layout metrics from the design spec (points, 393pt-wide reference). */
export const layout = {
  /** Horizontal page gutter used by feed content. */
  gutter: 12,
  /** Home / screen header height, excluding the top safe-area inset. */
  headerHeight: 52,
  /** Tab bar content height, excluding the bottom safe-area inset. */
  tabBarHeight: 52,
  /** Minimum touch target. */
  hitTarget: 44,
  /** Height of the gray band between feed units. */
  bandHeight: 6,
  avatar: 40,
  avatarSmall: 32,
  avatarLarge: 60,
  storyCardWidth: 104,
  storyCardHeight: 185,
  storyCardGap: 6,
  storyEdgeInset: 8,
  /** Post action row (Like / Comment / Share). */
  actionRowHeight: 44,
} as const;

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, TextStyle['fontWeight']>;

/** Type scale. System font only; spread a preset then override color if needed. */
export const type = {
  /** Screen titles: Notifications, Menu. */
  screenTitle: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: colors.text },
  /** Compact header title: "New post". */
  headerTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text },
  /** Section headings inside screens: "People you may know". */
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text },
  /** Big centered life-event title. */
  eventTitle: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.text },
  /** Feed body copy. */
  body: { fontSize: 16, lineHeight: 21, fontWeight: '400', color: colors.text },
  /** Author / page names, link-preview titles. */
  name: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text },
  /** Composer prompt. */
  prompt: { fontSize: 17, lineHeight: 22, fontWeight: '400', color: colors.text },
  /** List rows (settings, share options). */
  row: { fontSize: 17, lineHeight: 22, fontWeight: '400', color: colors.text },
  /** Secondary line under a row title. */
  rowSub: { fontSize: 15, lineHeight: 20, fontWeight: '400', color: colors.textSecondary },
  /** Counts row under a post: "1.1k comments". */
  count: { fontSize: 14, lineHeight: 18, fontWeight: '400', color: colors.textSecondary },
  /** Like / Comment / Share labels. */
  action: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.textSecondary },
  /** Timestamps and other meta. */
  meta: { fontSize: 13, lineHeight: 17, fontWeight: '400', color: colors.textSecondary },
  /** Small semibold labels: "Create story". */
  label: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.text },
  /** Link-preview source line (render uppercase). */
  caps: { fontSize: 12, lineHeight: 16, fontWeight: '400', color: colors.textSecondary, letterSpacing: 0.2 },
  /** Bottom tab labels. */
  tab: { fontSize: 11, lineHeight: 13, fontWeight: '500', color: colors.text },
  button: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text },
  buttonLarge: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text },
} as const satisfies Record<string, TextStyle>;

export type TypeName = keyof typeof type;

function shadow(y: number, blur: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0px ${y}px ${blur}px rgba(0,0,0,${opacity})` },
    android: { elevation },
    default: {
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
    },
  }) as ViewStyle;
}

export const shadows = {
  none: {} as ViewStyle,
  /** Cards sitting on white (story cards, suggestion cards). */
  card: shadow(1, 3, 0.1, 1),
  /** Floating controls. */
  raised: shadow(2, 8, 0.15, 4),
  /** Sheets and popovers. */
  sheet: shadow(8, 24, 0.2, 12),
} as const;

/** Thinnest line the device can draw (1 physical pixel). */
export const hairlineWidth = StyleSheet.hairlineWidth;

/** Border style helper for hairlines: `...hairline('Bottom')`. */
export function hairline(
  side: '' | 'Top' | 'Bottom' | 'Left' | 'Right' = '',
  color: string = colors.hairline,
): ViewStyle {
  return {
    [`border${side}Width`]: hairlineWidth,
    [`border${side}Color`]: color,
  } as ViewStyle;
}

/** Motion tokens: subtle and fast. */
export const motion = {
  press: 120,
  fast: 150,
  base: 200,
  slow: 250,
  /** Strong ease-out for UI (cubic-bezier control points). */
  easeOut: [0.23, 1, 0.32, 1],
  easeInOut: [0.77, 0, 0.175, 1],
} as const;

/** Extra touch area that brings a `size`-pt control up to the 44pt minimum. */
export function hitSlopFor(size: number): number {
  return Math.max(0, Math.ceil((layout.hitTarget - size) / 2));
}

export const theme = { colors, spacing, radii, layout, type, shadows, motion, fontWeights, hairlineWidth } as const;
export default theme;
