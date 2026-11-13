import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MuseBadge } from '@/components/common/MuseBadge';
import { Button } from '@/components/ui/Button';
import { useSuggestions } from '@/lib/suggestions';
import { colors, spacing } from '@/lib/theme';

const LABEL: Record<string, string> = {
  flare: 'Muse spotted a gap',
  free_time: 'Muse spotted free time',
  revive: 'Muse misses your crew',
  reel_move: 'From a Reel you saved',
  nobody_bit: 'Muse has an idea',
};

/**
 * Muse's newest pending suggestion, pinned at the top of the Moves sheet.
 * Muse proposes; "See" opens it to review and accept, "Not now" dismisses it.
 */
export function MuseSuggestionCard() {
  const router = useRouter();
  const item = useSuggestions((s) => s.items[0]);
  const status = useSuggestions((s) => s.status);
  useEffect(() => {
    if (status === 'idle') void useSuggestions.getState().load();
  }, [status]);

  if (!item) return null;
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.header}>
        <MuseBadge source={item.draft?.source} label={LABEL[item.type] ?? 'Muse'} />
      </View>
      <Text style={styles.message} numberOfLines={3}>
        {item.message}
      </Text>
      {item.chips.length > 0 ? (
        <View style={styles.chips}>
          {item.chips.slice(0, 3).map((c) => (
            <View key={c} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {c}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          title="See"
          size="sm"
          variant="primary"
          style={styles.flex}
          onPress={() => router.push(`/suggestion/${encodeURIComponent(item.id)}`)}
        />
        <Button
          title="Not now"
          size="sm"
          variant="secondary"
          style={styles.flex}
          onPress={() => void useSuggestions.getState().dismiss(item.id)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    padding: 14,
    gap: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  message: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surface, maxWidth: '100%' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  flex: { flex: 1 },
});
