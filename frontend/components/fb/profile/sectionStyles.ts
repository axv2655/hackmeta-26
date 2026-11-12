import { StyleSheet } from 'react-native';

import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

/** Shared chrome for the profile's stacked sections (Details, Friends, Posts). */
export const sectionStyles = StyleSheet.create({
  section: {
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: colors.white,
  },
  /** Section headings are a step above the 17pt feed section title, like the real profile. */
  heading: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  subheading: { ...typeScale.rowSub, marginTop: spacing.xxs },
  link: { ...typeScale.body, color: colors.tintText },
});
