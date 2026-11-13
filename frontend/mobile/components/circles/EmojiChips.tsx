import { ScrollView, StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radius, spacing } from '@/lib/theme';

export const CIRCLE_EMOJI = ['🏠', '🎓', '🧗', '☕', '🍜', '🏀', '🎮', '🎉', '📚', '💼'] as const;

/** A row of preset emoji; tap the selected one again to clear it. */
export function EmojiChips({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      {CIRCLE_EMOJI.map((e) => {
        const on = e === value;
        return (
          <PressableScale
            key={e}
            onPress={() => onChange(on ? '' : e)}
            scaleTo={0.9}
            style={[styles.chip, on && styles.on]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Emoji ${e}`}
          >
            <Text style={styles.emoji}>{e}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  chip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.transparent,
  },
  on: { backgroundColor: colors.chipSelectedBg, borderColor: colors.blue },
  emoji: { fontSize: 22 },
});
