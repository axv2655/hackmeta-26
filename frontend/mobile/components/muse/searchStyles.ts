import { StyleSheet } from 'react-native';

import { colors, spacing } from '@/lib/theme';

/** Shared look for the Muse search cards: matches the Moves sheet's glass cards. */
export const searchStyles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    padding: 14,
    gap: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  group: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.62)',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, lineHeight: 17, color: colors.textSecondary },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.text },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
});
