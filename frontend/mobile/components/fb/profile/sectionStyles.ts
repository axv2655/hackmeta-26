import { StyleSheet } from 'react-native';

import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';

/** Shared chrome for the profile's stacked sections (At a glance, Friends, Posts). */
export const sectionStyles = StyleSheet.create({
  section: {
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
  },
  /** Section headings: "At a glance", "Friends", "Posts". */
  heading: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.3,
    color: colors.text,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  subheading: { ...typeScale.rowSub, marginTop: spacing.xxs },
  /** Blue "See all" style link at the right of a heading. */
  link: { ...typeScale.row, color: colors.blue },
  /** Full-width gray button ("See all friends"): 44pt, rounded 12, #E9EBEE. */
  secondaryButton: {
    height: layout.hitTarget,
    borderRadius: radius.md,
    backgroundColor: colors.buttonSecondary,
  },
});
