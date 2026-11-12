import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, hairline, layout, shadows, spacing } from '@/lib/theme';

export type LogoutDialogProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const DIALOG_WIDTH = 270;
const DIALOG_RADIUS = 14;

/**
 * iOS-alert-style confirm. Built on Modal instead of Alert.alert because Alert
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
              scaleTo={1}
              pressedOpacity={0.4}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={styles.action}
            >
              <Text style={styles.actionText}>Cancel</Text>
            </PressableScale>
            <View style={styles.divider} />
            <PressableScale
              onPress={onConfirm}
              scaleTo={1}
              pressedOpacity={0.4}
              accessibilityRole="button"
              accessibilityLabel="Log out"
              style={styles.action}
            >
              <Text style={[styles.actionText, styles.confirmText]}>Log out</Text>
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
    borderRadius: DIALOG_RADIUS,
    backgroundColor: colors.white,
    ...shadows.sheet,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
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
  message: { fontSize: 13, lineHeight: 18, color: colors.text, textAlign: 'center' },
  actions: { flexDirection: 'row', ...hairline('Top') },
  action: { flex: 1, height: layout.hitTarget, alignItems: 'center', justifyContent: 'center' },
  divider: { ...hairline('Left') },
  actionText: { fontSize: 17, lineHeight: 22, color: colors.blue },
  confirmText: { fontWeight: fontWeights.semibold },
});

export default LogoutDialog;
