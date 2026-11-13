import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadows, spacing, type as typeScale } from '@/lib/theme';

export type ExplainerSheetProps = {
  visible: boolean;
  icon: IconName;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
  /** Extra content between the body and the buttons (a list). */
  children?: ReactNode;
};

/** A bottom sheet that explains a choice before it happens: one primary action and "Not now". */
export function ExplainerSheet({
  visible,
  icon,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  cancelLabel = 'Not now',
  children,
}: ExplainerSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.iconCircle}>
          <Icon name={icon} size={26} color={colors.blue} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
        {children}
        <View style={styles.buttons}>
          <Button title={confirmLabel} onPress={onConfirm} variant="primary" size="lg" />
          <Button title={cancelLabel} onPress={onCancel} variant="secondary" size="lg" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    gap: spacing.md,
    ...shadows.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.hairline,
    marginBottom: spacing.sm,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typeScale.eventTitle, textAlign: 'center' },
  body: { ...typeScale.body, color: colors.textSecondary, textAlign: 'center' },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
});
