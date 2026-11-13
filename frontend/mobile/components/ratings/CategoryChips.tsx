import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { CATEGORY_INFO } from '@/lib/categories';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';
import { CATEGORIES, type Category } from '@/lib/types';

type Props = { value?: Category; onChange: (c?: Category) => void };

function Chip({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: Category }) {
  const fg = on ? colors.chipSelectedText : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {icon ? <Icon name={CATEGORY_INFO[icon].icon} size={15} color={on ? fg : CATEGORY_INFO[icon].color} /> : null}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** "All" plus the 10 categories, one row, horizontally scrollable. */
export function CategoryChips({ value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip label="All" on={!value} onPress={() => onChange(undefined)} />
      {CATEGORIES.map((c) => (
        <Chip key={c} label={CATEGORY_INFO[c].label} icon={c} on={value === c} onPress={() => onChange(c)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: layout.gutter, paddingVertical: spacing.sm, gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.chipSelectedBg },
  text: { ...typeScale.label, fontSize: 14 },
});

export default CategoryChips;
