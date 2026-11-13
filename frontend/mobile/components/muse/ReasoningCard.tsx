import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { Icon } from '@/components/ui/Icon';
import { categoryMeta } from '@/lib/categories';
import { miles, timeRange } from '@/lib/format';
import { kmBetween, useLocation, here } from '@/lib/location';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { MuseMark, Suggestion } from '@/lib/types';

import { suggestionTitle, walkLabel } from './suggestionCopy';

export type ReasoningCardProps = {
  suggestion: Suggestion;
  /** Opens "Your day" (/calendar). Shown with the free-window line. */
  onSeeDay: () => void;
};

/**
 * Why Muse is suggesting this: the title, Muse's message, its reasoning
 * chips, the free window it found and the place it picked. The badge says
 * honestly whether the model or its heuristic wrote it.
 */
export function ReasoningCard({ suggestion, onSeeDay }: ReasoningCardProps) {
  const { draft } = suggestion;
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title} accessibilityRole="header">
          {suggestionTitle(suggestion.type)}
        </Text>
        <MuseBadge source={draft?.source} />
      </View>
      <Text style={styles.message}>{suggestion.message}</Text>
      {suggestion.chips.length ? <Chips chips={suggestion.chips} /> : null}
      {suggestion.window_start && suggestion.window_end ? (
        <WindowLine start={suggestion.window_start} end={suggestion.window_end} onSeeDay={onSeeDay} />
      ) : null}
      {draft?.mark ? <PlaceRow mark={draft.mark} /> : null}
    </View>
  );
}

function Chips({ chips }: { chips: string[] }) {
  return (
    <View style={styles.chips}>
      {chips.map((chip) => (
        <View key={chip} style={styles.chip}>
          <Text style={styles.chipText} numberOfLines={1}>
            {chip}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WindowLine({ start, end, onSeeDay }: { start: string; end: string; onSeeDay: () => void }) {
  return (
    <View style={styles.infoRow}>
      <Icon name="calendar" size={18} color={colors.textSecondary} />
      <Text style={styles.infoText}>free {timeRange(start, end)}</Text>
      <Pressable onPress={onSeeDay} hitSlop={8} accessibilityRole="link">
        <Text style={styles.link}>See your day</Text>
      </Pressable>
    </View>
  );
}

function PlaceRow({ mark }: { mark: MuseMark }) {
  // Re-render when the phone's position changes; distance never leaves the phone.
  useLocation((s) => s.coords);
  const km = kmBetween(here(), { latitude: mark.lat, longitude: mark.lng });
  const meta = categoryMeta(mark.category);
  return (
    <View style={styles.infoRow}>
      <Icon name={meta.icon} size={18} color={meta.color} />
      <View style={styles.placeText}>
        <Text style={styles.placeName} numberOfLines={1}>
          {mark.name}
        </Text>
        <Text style={styles.placeSub} numberOfLines={1}>
          {miles(km)} · {walkLabel(km)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { ...typeScale.eventTitle, flexShrink: 1 },
  message: { ...typeScale.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    backgroundColor: colors.chipSelectedBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    maxWidth: '100%',
  },
  chipText: { ...typeScale.label, color: colors.chipSelectedText },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoText: { ...typeScale.rowSub, color: colors.text, flexShrink: 1 },
  link: { ...typeScale.button, color: colors.blue },
  placeText: { flex: 1, minWidth: 0 },
  placeName: { ...typeScale.name },
  placeSub: { ...typeScale.meta },
});

export default ReasoningCard;
