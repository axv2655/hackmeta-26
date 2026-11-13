import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Hairline } from '@/components/ui/Hairline';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, radius, shadows, spacing, type as typeScale } from '@/lib/theme';

/** Distance the sheet rises on open. The Modal's own fade covers the rest. */
const SHEET_TRAVEL = 320;
const SHEET_DURATION = 280;
/** iOS 26 sheets have deep, continuous corners. */
const SHEET_RADIUS = radius.xl + 10;
// iOS sheet curve.
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export type SheetOption = { key: string; icon: IconName; label: string };

export type NotificationActionSheetProps = {
  visible: boolean;
  /** Shown above the options (an avatar and the row text). Kept by the parent while the sheet fades out. */
  header?: ReactNode;
  options: SheetOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
};

/** Facebook-style bottom sheet: optional header, then one row per option. Works on iOS and Android. */
export function NotificationActionSheet({ visible, header, options, onSelect, onClose }: NotificationActionSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const translateY = useSharedValue(SHEET_TRAVEL);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      translateY.set(0);
      return;
    }
    translateY.set(SHEET_TRAVEL);
    translateY.set(withTiming(0, { duration: SHEET_DURATION, easing: EASE_SHEET }));
  }, [visible, reduceMotion, translateY]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        />
        <Animated.View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }, sheetStyle]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />

          {header ? (
            <>
              <View style={styles.summary}>{header}</View>
              <Hairline />
            </>
          ) : null}

          <View style={styles.options}>
            {options.map((option) => (
              <PressableScale
                key={option.key}
                onPress={() => onSelect(option.key)}
                scaleTo={1}
                pressedOpacity={0.5}
                accessibilityLabel={option.label}
                style={styles.option}
              >
                <View style={styles.optionIcon}>
                  <Icon name={option.icon} size={20} color={colors.text} />
                </View>
                <Text style={styles.optionLabel} numberOfLines={1}>
                  {option.label}
                </Text>
              </PressableScale>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The usual sheet header: a picture over centered text. */
export function SheetSummary({ picture, text }: { picture: ReactNode; text: ReactNode }) {
  return (
    <>
      {picture}
      <Text style={styles.summaryText} numberOfLines={3}>
        {text}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderCurve: 'continuous',
    ...shadows.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.sm,
    backgroundColor: colors.hairline,
  },
  summary: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  summaryText: { ...typeScale.row, textAlign: 'center' },
  options: { paddingTop: spacing.sm },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.buttonSecondary,
  },
  optionLabel: { ...typeScale.row, fontWeight: fontWeights.medium, flex: 1 },
});

export default NotificationActionSheet;
