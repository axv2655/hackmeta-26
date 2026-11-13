import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/lib/toast';
import { colors, layout, radius, shadows, spacing, type as typeScale } from '@/lib/theme';

/**
 * Renders the current toast above the tab bar. Mounted once in the root layout.
 * Tap the message to dismiss; the action button runs its handler and dismisses.
 */
export function Toast() {
  const insets = useSafeAreaInsets();
  const current = useToast((s) => s.current);
  const hide = useToast((s) => s.hide);
  if (!current) return null;

  const bottom = insets.bottom + layout.tabBarHeight + layout.tabBarGap + spacing.sm;
  const runAction = () => {
    current.action?.onPress();
    hide(current.id);
  };

  return (
    <View style={[styles.layer, { bottom }]} pointerEvents="box-none">
      <Animated.View
        key={current.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(150)}
        style={styles.toast}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Pressable style={styles.messageWrap} onPress={() => hide(current.id)} accessibilityLabel={current.message}>
          <Text style={styles.message} numberOfLines={3}>
            {current.message}
          </Text>
        </Pressable>
        {current.action ? (
          <Pressable onPress={runAction} hitSlop={8} accessibilityRole="button" style={styles.actionWrap}>
            <Text style={styles.action}>{current.action.label}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: layout.gutter },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 520,
    alignSelf: 'stretch',
    backgroundColor: colors.text,
    borderRadius: radius.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    minHeight: 48,
    ...shadows.sheet,
  },
  messageWrap: { flex: 1, paddingVertical: spacing.md },
  message: { ...typeScale.body, fontSize: 15, lineHeight: 20, color: colors.white },
  actionWrap: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  action: { ...typeScale.button, color: colors.chipSelectedBg },
});

export default Toast;
