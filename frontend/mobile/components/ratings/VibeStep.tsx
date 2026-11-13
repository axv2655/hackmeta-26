import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

type Props = {
  markName: string;
  options: string[];
  tags: string[];
  note: string;
  submitting: boolean;
  onToggle: (tag: string) => void;
  onNote: (note: string) => void;
  onSubmit: () => void;
};

/** Step 3: vibe chips and an optional note, then submit. */
export function VibeStep({ markName, options, tags, note, submitting, onToggle, onNote, onSubmit }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        What was {markName} like?
      </Text>
      <Text style={styles.sub}>Optional. Muse uses these to learn your taste.</Text>
      <View style={styles.chips}>
        {options.map((t) => {
          const on = tags.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => onToggle(t)}
              style={[styles.chip, on && styles.chipOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              disabled={submitting}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={note}
        onChangeText={onNote}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.placeholder}
        style={styles.note}
        multiline
        maxLength={500}
        editable={!submitting}
      />
      <Button
        title={submitting ? 'Saving...' : 'Save ranking'}
        size="lg"
        fullWidth
        disabled={submitting}
        onPress={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  title: { ...typeScale.eventTitle },
  sub: { ...typeScale.rowSub },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.chipSelectedBg },
  chipText: { ...typeScale.label, fontSize: 15, lineHeight: 20 },
  chipTextOn: { color: colors.chipSelectedText },
  note: {
    ...typeScale.body,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
});

export default VibeStep;
