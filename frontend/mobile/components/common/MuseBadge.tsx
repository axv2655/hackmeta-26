import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { museSourceLabel, useMuseStatus, type MuseSource } from '@/lib/muse';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

export type MuseBadgeProps = {
  /** Where this output came from. Omitted means "whatever Muse is doing right now" (`/muse/status`). */
  source?: MuseSource;
  /** Custom text, e.g. "Muse picked". Gets " · heuristic" appended when the fallback produced it. */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

/** Honest text for the badge: never a plain "Muse" for heuristic output. */
export function museBadgeText(source: MuseSource, label?: string): string {
  if (!label) return museSourceLabel(source);
  if (source === 'heuristic' && !/heuristic/i.test(label)) return `${label} · heuristic`;
  return label;
}

/** Sparkle capsule that marks Muse output and says whether the model or its heuristic made it. */
export function MuseBadge({ source, label, style }: MuseBadgeProps) {
  const live = useMuseStatus((s) => s.status?.live);
  const load = useMuseStatus((s) => s.load);
  useEffect(() => {
    if (!source) void load();
  }, [source, load]);

  const resolved: MuseSource = source ?? (live ? 'muse' : 'heuristic');
  const fromModel = resolved === 'muse';
  const text = museBadgeText(resolved, label);
  const fg = fromModel ? colors.chipSelectedText : colors.textSecondary;

  return (
    <View
      style={[styles.badge, { backgroundColor: fromModel ? colors.chipSelectedBg : colors.surface }, style]}
      accessible
      accessibilityLabel={text}
    >
      <Icon name="sparkles" size={13} color={fg} strokeWidth={2.2} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  text: { ...typeScale.label, fontSize: 12, lineHeight: 15 },
});

export default MuseBadge;
