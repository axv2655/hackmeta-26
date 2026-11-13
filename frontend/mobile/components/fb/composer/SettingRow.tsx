import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, hairline, layout, spacing, type as typeScale } from '@/lib/theme';

export type SettingRowProps = {
  icon: IconName;
  title: string;
  /** Gray second line. Rows with one are 72pt tall, rows without are 60pt. */
  subtitle?: string;
  /** Makes the whole row tappable. Leave undefined when only `trailing` is interactive. */
  onPress?: () => void;
  /** Right-edge content. Default: a chevron when the row is tappable, nothing otherwise. */
  trailing?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Bottom hairline. Default true; turn it off on the last row of a list. */
  border?: boolean;
  /** Content under the title line, inside the row's bottom hairline (helper copy). */
  children?: ReactNode;
};

/** Share-settings row: 24pt icon, 17pt title, optional gray subtitle, trailing control, hairline underneath. */
export function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  accessibilityLabel,
  accessibilityHint,
  border = true,
  children,
}: SettingRowProps) {
  const line = (
    <>
      <Icon name={icon} size={24} color={colors.text} />
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </>
  );
  const height = subtitle ? styles.tall : styles.short;

  if (onPress) {
    return (
      <View style={border ? styles.bordered : undefined}>
        <PressableScale
          onPress={onPress}
          scaleTo={1}
          pressedOpacity={0.5}
          style={[styles.line, height]}
          accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
          accessibilityHint={accessibilityHint}
        >
          {line}
          {trailing ?? (
            <View style={styles.chevron}>
              <Icon name="chevron-right" size={22} color={colors.text} />
            </View>
          )}
        </PressableScale>
        {children}
      </View>
    );
  }

  return (
    <View style={border ? styles.bordered : undefined}>
      <View style={[styles.line, height]}>
        {line}
        {trailing}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bordered: { ...hairline('Bottom') },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: layout.gutter,
    paddingRight: layout.gutter,
  },
  tall: { minHeight: 72 },
  short: { minHeight: 60 },
  texts: { flex: 1, justifyContent: 'center' },
  title: { ...typeScale.row },
  subtitle: { ...typeScale.rowSub },
  // Same 44pt slot as the icon buttons other rows put here, so trailing glyphs line up.
  chevron: {
    width: layout.hitTarget,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
});

export default SettingRow;
