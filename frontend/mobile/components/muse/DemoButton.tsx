import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { errorMessage } from '@/lib/backend';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';

export type DemoButtonProps = {
  label: string;
  /** Second line: what the button stands in for. */
  sub?: string;
  icon?: IconName;
  /** The action. A returned string is shown as a toast; a thrown error shows its message. */
  run: () => Promise<string | void>;
  disabled?: boolean;
};

/** A big Demo Control button: spinner while it runs, then a toast with the result or the error. */
export function DemoButton({ label, sub, icon, run, disabled = false }: DemoButtonProps) {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const message = await run();
      if (message) toast(message);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const off = disabled || busy;
  return (
    <PressableScale
      onPress={() => void onPress()}
      disabled={off}
      haptic
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      style={styles.button}
    >
      <View style={styles.icon}>
        {busy ? (
          <ActivityIndicator color={colors.blue} />
        ) : (
          <Icon name={icon ?? 'zap'} size={20} color={colors.blue} />
        )}
      </View>
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0 },
  label: { ...typeScale.name },
  sub: { ...typeScale.meta },
});

export default DemoButton;
