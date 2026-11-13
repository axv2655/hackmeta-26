import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { colors, radius, shadows, spacing, type as typeScale } from '@/lib/theme';

export type ComingSoonSheetProps = {
  /** What was tapped ("Marketplace"). Null hides the sheet. */
  feature: { label: string; icon: IconName } | null;
  onClose: () => void;
};

/**
 * Bottom sheet for Facebook filler that this demo does not build (Marketplace,
 * Gaming, Help...). It says so plainly instead of the tile doing nothing.
 */
export function ComingSoonSheet({ feature, onClose }: ComingSoonSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!feature} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          {feature ? (
            <>
              <View style={styles.icon}>
                <Icon name={feature.icon} size={28} color={colors.blue} />
              </View>
              <Text style={styles.title}>{feature.label} is coming soon</Text>
              <Text style={styles.body}>
                This part of Facebook isn't in the Moves demo. Moves, Reels, Saved, Events and Settings all work.
              </Text>
            </>
          ) : null}
          <Button title="Got it" size="lg" fullWidth onPress={onClose} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sheet,
  },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.hairline, marginBottom: spacing.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tintBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typeScale.sectionTitle, textAlign: 'center' },
  body: { ...typeScale.rowSub, textAlign: 'center' },
  button: { marginTop: spacing.md },
});

export default ComingSoonSheet;
