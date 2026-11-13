import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';

import { useLocation } from '@/lib/location';
import { useMuseStatus } from '@/lib/muse';
import { useSession } from '@/lib/session';

/**
 * Session upkeep for the root layout:
 * - on sign-in and on every cold start with a saved account, validate it with
 *   `GET /me` (a 401 logs out inside `api()`) and load the Muse status once;
 * - right after a sign-up, open onboarding (login.tsx does not navigate, so
 *   this cannot race the `Stack.Protected` swap; onboarding clears the flag);
 * - when the app returns to the foreground, re-read location permission
 *   without prompting (the user may have changed it in iOS Settings).
 */
export function useShellSession(): void {
  const router = useRouter();
  const hydrated = useSession((s) => s.hydrated);
  const userId = useSession((s) => s.userId);
  const justSignedUp = useSession((s) => s.justSignedUp);
  const sentToOnboarding = useRef<string | null>(null);

  useEffect(() => {
    void useSession.getState().loadUsers();
  }, []);

  useEffect(() => {
    if (!hydrated || !userId) return;
    void useSession.getState().refreshMe();
    void useMuseStatus.getState().load();
  }, [hydrated, userId]);

  useEffect(() => {
    if (!hydrated || !userId || !justSignedUp || sentToOnboarding.current === userId) return;
    // Let the signed-in stack mount before navigating into it.
    const timer = setTimeout(() => {
      sentToOnboarding.current = userId;
      router.replace('/onboarding');
    }, 0);
    return () => clearTimeout(timer);
  }, [hydrated, userId, justSignedUp, router]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useLocation.getState().recheck();
    });
    return () => sub.remove();
  }, []);
}
