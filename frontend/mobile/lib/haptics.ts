import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// expo-haptics has no web implementation worth calling (and throws on some
// browsers), so every wrapper is a no-op there. Failures on native are
// swallowed too: haptics are never worth an unhandled rejection.
const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function run(fire: () => Promise<void>): void {
  if (!enabled) return;
  fire().catch(() => {});
}

/** Light impact for ordinary presses (like, tab switch, button). */
export function tap(): void {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Selection tick for pickers, toggles and segmented choices. */
export function selection(): void {
  run(() => Haptics.selectionAsync());
}

/** Success notification for a completed action (post shared, request sent). */
export function success(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification for destructive confirmations. */
export function warning(): void {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

export const haptics = { tap, selection, success, warning };
export default haptics;
