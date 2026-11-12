import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, radius, shadows, spacing } from '@/lib/theme';

export type LogoutDialogProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const DIALOG_WIDTH = 300;
/** iOS 26 alerts are much rounder than before. */
const DIALOG_RADIUS = 32;
const ACTION_HEIGHT = 48;

/**
 * iOS 26 alert-style confirm: rounded card, side-by-side capsule buttons. Built on Modal instead of Alert.alert because Alert
 * is a no-op on react-native-web, and the mock has to work in a browser too.
 */
export function LogoutDialog({ visible, onCancel, onConfirm }: LogoutDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.dialog} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={styles.body}>
            <Text style={styles.title}>Log out of your account?</Text>
            <Text style={styles.message}>You can log back in at any time.</Text>
          </View>
          <View style={styles.actions}>
            <PressableScale
              onPress={onCancel}
              scaleTo={0.97}
              pressedOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.action}
            >
              <Text style={styles.actionText}>Cancel</Text>
            </PressableScale>
            <PressableScale
              onPress={onConfirm}
              scaleTo={0.97}
              pressedOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Log out"
              style={styles.action}
            >
              <Text style={[styles.actionText, styles.destructiveText]}>Log out</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
  },
  dialog: {
    width: DIALOG_WIDTH,
    maxWidth: '100%',
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
    borderRadius: DIALOG_RADIUS,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    ...shadows.sheet,
  },
  body: {
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  message: { fontSize: 15, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flex: 1,
    height: ACTION_HEIGHT,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.buttonSecondary,
  },
  actionText: { fontSize: 17, lineHeight: 22, fontWeight: fontWeights.semibold, color: colors.text },
  destructiveText: { color: colors.badgeRed },
});

export default LogoutDialog;
