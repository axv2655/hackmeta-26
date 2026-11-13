import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { CATEGORY_INFO } from '@/lib/categories';
import { toast } from '@/lib/toast';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import { CATEGORIES, type Category } from '@/lib/types';

export type CategoryChipsProps = {
  /** Saved list; empty means every kind. */
  value: Category[];
  onChange: (next: Category[]) => void;
};

/** What the chips show as on: an empty list means all of them. */
function selectedSet(value: Category[]): Set<Category> {
  return new Set(value.length === 0 ? CATEGORIES : value);
}

/** Toggles `c`. Returns null when it would leave nothing selected. All selected saves as []. */
export function nextCategories(value: Category[], c: Category): Category[] | null {
  const on = selectedSet(value);
  const next = on.has(c) ? CATEGORIES.filter((x) => on.has(x) && x !== c) : CATEGORIES.filter((x) => on.has(x) || x === c);
  if (next.length === 0) return null;
  return next.length === CATEGORIES.length ? [] : next;
}

/** "Kinds of Moves you want": every chip on by default, tap to turn a kind off. */
export function CategoryChips({ value, onChange }: CategoryChipsProps) {
  const on = selectedSet(value);
  const press = (c: Category) => {
    const next = nextCategories(value, c);
    if (next === null) {
      toast('Keep at least one kind of Move');
      return;
    }
    onChange(next);
  };
  return (
    <View style={styles.wrap}>
      {CATEGORIES.map((c) => {
        const meta = CATEGORY_INFO[c];
        const selected = on.has(c);
        return (
          <Pressable
            key={c}
            onPress={() => press(c)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={meta.label}
            style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
          >
            <Icon name={meta.icon} size={15} color={selected ? colors.chipSelectedText : colors.textSecondary} />
            <Text style={[styles.label, { color: selected ? colors.chipSelectedText : colors.textSecondary }]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipOn: { backgroundColor: colors.chipSelectedBg, borderColor: colors.chipSelectedBg },
  chipOff: { backgroundColor: colors.white, borderColor: colors.hairline },
  label: { ...typeScale.label, fontSize: 14 },
});
