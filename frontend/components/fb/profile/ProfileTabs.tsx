import { ScrollView, StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

import { profileTabs, type ProfileTabKey } from './data';

export type ProfileTabsProps = {
  active: ProfileTabKey;
  onChange: (key: ProfileTabKey) => void;
};

/** All / Photos / Reels / Memories chips. Selected = light-blue capsule, others plain text. */
export function ProfileTabs({ active, onChange }: ProfileTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      style={styles.scroll}
    >
      {profileTabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <PressableScale
            key={tab.key}
            onPress={() => {
              if (!selected) selection();
              onChange(tab.key);
            }}
            scaleTo={0.96}
            pressedOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, backgroundColor: colors.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: layout.gutter - spacing.xxs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  chip: {
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.chipSelectedBg },
  label: { ...typeScale.buttonLarge },
  labelSelected: { color: colors.chipSelectedText },
});

export default ProfileTabs;
