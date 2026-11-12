import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cubicBezier, FadeIn, useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import type { MenuRow } from '@/lib/mock';
import { colors, fontWeights, hairline, motion, radii, shadows, spacing, type as typeScale } from '@/lib/theme';

const HEADER_HEIGHT = 56;
const SUB_ROW_HEIGHT = 52;
const HEADER_ICON = 28;

const EASE_OUT = cubicBezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);

export type AccordionSectionProps = {
  row: MenuRow;
  /** Custom element in place of the row icon (the Meta symbol on "Also from Meta"). */
  leading?: ReactNode;
  defaultOpen?: boolean;
  onPressItem?: (item: MenuRow) => void;
};

/** Menu section header (icon, title, chevron) that expands into white sub-row cards. */
export function AccordionSection({ row, leading, defaultOpen = false, onPressItem }: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reduceMotion = useReducedMotion();
  const children = row.children ?? [];

  const toggle = () => {
    selection();
    setOpen((v) => !v);
  };

  return (
    <View style={styles.section}>
      <PressableScale
        onPress={toggle}
        scaleTo={1}
        pressedOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={row.label}
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        <View style={styles.headerIcon}>
          {leading ?? <Icon name={row.icon} size={HEADER_ICON} color={colors.textSecondary} />}
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {row.label}
        </Text>
        {/* Two-state toggle, so a CSS transition on the transform is the whole animation. */}
        <Animated.View
          style={{
            transform: [{ rotate: open ? '180deg' : '0deg' }],
            transitionProperty: 'transform',
            transitionDuration: reduceMotion ? 0 : motion.base,
            transitionTimingFunction: EASE_OUT,
          }}
        >
          <Icon name="chevron-down" size={22} color={colors.textSecondary} />
        </Animated.View>
      </PressableScale>

      {open ? (
        <Animated.View entering={FadeIn.duration(motion.fast)} style={styles.items}>
          {children.map((item) => (
            <PressableScale
              key={item.id}
              onPress={() => onPressItem?.(item)}
              scaleTo={0.98}
              haptic
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={styles.item}
            >
              <Icon name={item.icon} size={24} color={colors.text} />
              <Text style={styles.itemLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </PressableScale>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { ...hairline('Top') },
  header: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  headerIcon: { width: HEADER_ICON, height: HEADER_ICON, alignItems: 'center', justifyContent: 'center' },
  title: { ...typeScale.row, fontWeight: fontWeights.semibold, flex: 1 },
  items: { gap: spacing.sm, paddingBottom: spacing.md },
  item: {
    height: SUB_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    ...shadows.card,
  },
  itemLabel: { ...typeScale.name, flex: 1 },
});

export default AccordionSection;
