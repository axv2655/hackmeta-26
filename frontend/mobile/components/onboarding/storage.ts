import AsyncStorage from '@react-native-async-storage/async-storage';

/** Set once onboarding was finished or skipped on this phone. */
export const ONBOARDED_KEY = 'moves-onboarded';

export async function markOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Storage unavailable: onboarding may show again next time, which is harmless.
  }
}
