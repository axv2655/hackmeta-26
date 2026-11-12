import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { MenuShortcut } from '@/lib/mock';
import { colors, fontWeights, radii, shadows, spacing, type as typeScale } from '@/lib/theme';

export const TILE_HEIGHT = 88;
const TILE_ICON = 28;

export type ShortcutTileProps = {
  shortcut: MenuShortcut;
  onPress?: (shortcut: MenuShortcut) => void;
  /** Small blue "New" tag in the top-right corner. */
  isNew?: boolean;
  /** Gray line next to the label (full-width tiles only: there is no room in a half-width one). */
  tagline?: string;
};

/** White rounded shortcut tile: colored icon top-left, label bottom-left. */
export function ShortcutTile({ shortcut, onPress, isNew = false, tagline }: ShortcutTileProps) {
  const badge = isNew ? 'New' : shortcut.badge;

  return (
    <PressableScale
      onPress={() => onPress?.(shortcut)}
      haptic
      accessibilityRole="button"
      accessibilityLabel={badge ? `${shortcut.label}, ${badge}` : shortcut.label}
      style={styles.tile}
    >
      <View style={styles.top}>
        <Icon name={shortcut.icon} size={TILE_ICON} color={shortcut.color} />
        {isNew ? (
          <View style={styles.newTag}>
            <Text style={styles.newTagText} allowFontScaling={false}>
              New
            </Text>
          </View>
        ) : shortcut.badge ? (
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText} numberOfLines={1}>
              {shortcut.badge}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.bottom}>
        <Text style={styles.label} numberOfLines={1}>
          {shortcut.label}
        </Text>
        {tagline ? (
          <Text style={styles.tagline} numberOfLines={1}>
            {tagline}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    height: TILE_HEIGHT,
    padding: spacing.md,
    justifyContent: 'space-between',
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadows.card,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  bottom: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  label: { ...typeScale.button, flexShrink: 0 },
  tagline: { ...typeScale.meta, flex: 1 },
  newTag: {
    height: 20,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },
  newTagText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeights.bold,
    color: colors.white,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, height: 20 },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.badgeRed },
  badgeText: { ...typeScale.meta },
});

export default ShortcutTile;
