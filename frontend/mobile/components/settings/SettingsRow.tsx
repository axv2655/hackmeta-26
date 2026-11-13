import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, hairline, layout, radius, spacing, type as typeScale } from '@/lib/theme';

type BaseProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Custom leading element instead of `icon` (an avatar). */
  left?: ReactNode;
  /** Draw a hairline above the row (every row but the first in a group). */
  divider?: boolean;
};

function Leading({ icon, left }: Pick<BaseProps, 'icon' | 'left'>) {
  if (left) return <View style={styles.leading}>{left}</View>;
  if (!icon) return null;
  return (
    <View style={[styles.leading, styles.iconCircle]}>
      <Icon name={icon} size={20} color={colors.text} />
    </View>
  );
}

function Texts({ title, subtitle }: Pick<BaseProps, 'title' | 'subtitle'>) {
  return (
    <View style={styles.texts}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export type LinkRowProps = BaseProps & {
  onPress?: () => void;
  /** Text on the right, before the chevron ("3 people"). */
  value?: string;
  /** Right side instead of the chevron. */
  right?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
};

/** A tappable settings row with a chevron. Without `onPress` it is a plain info row. */
export function LinkRow({ title, subtitle, icon, left, divider, onPress, value, right, busy, disabled }: LinkRowProps) {
  const trailing = busy ? (
    <ActivityIndicator color={colors.textSecondary} />
  ) : (
    (right ?? (onPress ? <Icon name="chevron-right" size={18} color={colors.placeholder} /> : null))
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || busy || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && onPress ? styles.pressed : null]}
    >
      <Leading icon={icon} left={left} />
      <Texts title={title} subtitle={subtitle} />
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {trailing}
    </Pressable>
  );
}

export type ToggleRowProps = BaseProps & {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Shows a spinner instead of the switch while an OS prompt is up. */
  busy?: boolean;
  /** Extra content under the texts (a notice with a button). */
  children?: ReactNode;
};

/** A settings row with a switch. The whole row toggles. */
export function ToggleRow({ title, subtitle, icon, left, divider, value, onValueChange, disabled, busy, children }: ToggleRowProps) {
  const toggle = () => {
    if (!disabled && !busy) onValueChange(!value);
  };
  return (
    <View style={[divider && styles.divider]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: disabled || busy }}
        accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
        style={styles.row}
      >
        <Leading icon={icon} left={left} />
        <Texts title={title} subtitle={subtitle} />
        {busy ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          <Switch
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            trackColor={{ false: colors.grayButton, true: colors.blue }}
            thumbColor={Platform.OS === 'android' ? colors.white : undefined}
            ios_backgroundColor={colors.grayButton}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
      </Pressable>
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

export type SettingsGroupProps = {
  title?: string;
  /** Small print under the card. */
  footer?: string;
  children: ReactNode;
};

/** A titled white card of rows on the gray page. */
export function SettingsGroup({ title, footer, children }: SettingsGroupProps) {
  return (
    <View style={styles.group}>
      {title ? (
        <Text style={styles.groupTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  groupTitle: { ...typeScale.sectionTitle, marginBottom: spacing.sm },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' },
  footer: { ...typeScale.meta, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.hitTarget + spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  divider: { ...hairline('Top') },
  pressed: { backgroundColor: colors.surface },
  leading: { alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface },
  texts: { flex: 1, gap: 2 },
  title: { ...typeScale.row },
  subtitle: { ...typeScale.rowSub, fontSize: 14, lineHeight: 19 },
  value: { ...typeScale.rowSub },
  extra: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
