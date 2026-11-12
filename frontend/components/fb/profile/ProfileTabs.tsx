import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { colors, hairline, layout, radii, spacing, type as typeScale } from '@/lib/theme';

import { profileTabs, type ProfileTabKey } from './data';

export type ProfileTabsProps = {
  active: ProfileTabKey;
  onChange: (key: ProfileTabKey) => void;
};

/** Posts / Photos / Reels pills. The active pill is tinted light blue. */
export function ProfileTabs({ active, onChange }: ProfileTabsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {profileTabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <PressableScale
            key={tab.key}
            onPress={() => {
              if (!selected) selection();
              onChange(tab.key);
            }}
            pressedOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={[styles.pill, selected && styles.pillActive]}
          >
            <Text style={[styles.label, selected && styles.labelActive]}>{tab.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    ...hairline('Bottom'),
  },
  pill: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.tintBg },
  label: { ...typeScale.button, color: colors.textSecondary },
  labelActive: { color: colors.tintText },
});

export default ProfileTabs;
