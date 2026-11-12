import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/Avatar';
import { Hairline } from '@/components/ui/Hairline';
import { Icon, IconBadge, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Notification, TextSegment } from '@/lib/mock';
import { colors, fontWeights, layout, radii, shadows, spacing, type as typeScale } from '@/lib/theme';

/** Distance the sheet rises on open. The Modal's own fade covers the rest. */
const SHEET_TRAVEL = 320;
const SHEET_DURATION = 280;
// iOS sheet curve.
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export type NotificationSheetAction = 'toggle-read' | 'remove' | 'turn-off';

export type NotificationActionSheetProps = {
  visible: boolean;
  /** Kept by the parent after closing so the content does not blank out during the fade. */
  notification: Notification | null;
  /** The text the row is currently showing (it changes once a friend request is answered). */
  segments: TextSegment[];
  unread: boolean;
  onSelect: (action: NotificationSheetAction) => void;
  onClose: () => void;
};

type Option = { action: NotificationSheetAction; icon: IconName; label: string };

/** Bottom sheet behind a row's "..." button. */
export function NotificationActionSheet({
  visible,
  notification,
  segments,
  unread,
  onSelect,
  onClose,
}: NotificationActionSheetProps) {
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

  const options: Option[] = [
    { action: 'toggle-read', icon: 'check', label: unread ? 'Mark as read' : 'Mark as unread' },
    { action: 'remove', icon: 'x-circle', label: 'Remove this notification' },
    { action: 'turn-off', icon: 'bell-off', label: 'Turn off notifications like this' },
  ];

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

          {notification ? (
            <View style={styles.summary}>
              <Avatar
                source={notification.avatar}
                size={layout.avatarLarge}
                badge={<IconBadge name={notification.badgeIcon} color={notification.badgeColor} size={24} ring />}
              />
              <Text style={styles.summaryText} numberOfLines={3}>
                {segments.map((segment, index) => (
                  <Text key={index} style={segment.bold ? styles.bold : undefined}>
                    {segment.text}
                  </Text>
                ))}
              </Text>
            </View>
          ) : null}

          <Hairline />

          <View style={styles.options}>
            {options.map((option) => (
              <PressableScale
                key={option.action}
                onPress={() => onSelect(option.action)}
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

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
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
  summaryText: { ...typeScale.rowSub, color: colors.text, textAlign: 'center' },
  bold: { fontWeight: fontWeights.semibold },
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
    backgroundColor: colors.grayButton,
  },
  optionLabel: { ...typeScale.row, fontWeight: fontWeights.medium, flex: 1 },
});

export default NotificationActionSheet;
