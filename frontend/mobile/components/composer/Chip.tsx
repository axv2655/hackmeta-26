import { StyleSheet, Text } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { toUser } from '@/lib/people';
import { colors, spacing, type as typeScale } from '@/lib/theme';
import type { UserLite } from '@/lib/types';

export type ChipProps = {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: IconName;
  tag?: string;
  small?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
};

/** Selectable capsule used across the composer. */
export function Chip({ label, on, onPress, icon, tag, small, disabled, accessibilityLabel }: ChipProps) {
  return (
    <PressableScale
      onPress={() => {
        selection();
        onPress();
      }}
      disabled={disabled}
      style={[styles.chip, small && styles.chipSmall, on && styles.chipOn, disabled && styles.disabled]}
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: on, disabled }}
    >
      {icon ? <Icon name={icon} size={15} color={on ? colors.chipSelectedText : colors.textSecondary} /> : null}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
    </PressableScale>
  );
}

/** A person's photo (bundled for the cast, else a stable stand-in). */
export function Face({ user, size }: { user: UserLite; size: number }) {
  return <Avatar source={toUser(user).avatar} size={size} />;
}

/** Shared text styles for composer sections. */
export const section = StyleSheet.create({
  label: { ...typeScale.sectionTitle, marginTop: spacing.sm },
  sub: { ...typeScale.rowSub },
  meta: { ...typeScale.meta },
  error: { ...typeScale.rowSub, color: colors.badgeRed },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  link: { ...typeScale.button, color: colors.blue },
});

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  chipSmall: { height: 30, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.chipSelectedBg },
  disabled: { opacity: 0.5 },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.text, maxWidth: 220 },
  chipTextOn: { color: colors.chipSelectedText },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.white,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
