import { isOffline } from './backend';

/**
 * Demo build switch (`EXPO_PUBLIC_DEMO=1`): shows Demo Control and lets
 * screens fill in with bundled sample data.
 */
export const DEMO: boolean = process.env.EXPO_PUBLIC_DEMO === '1';

/**
 * The mock rule. `lib/mock` data may be shown only when this returns true:
 * in a demo build, or when `e` is a network failure (the backend could not be
 * reached, `ApiError.status === 0`). A store that falls back must set
 * `sample: true`, the screen must show `<OfflineBar />` (or a "Sample data"
 * pill), and any mutation on sample data must `toast("You're offline")` and do
 * nothing. HTTP errors (4xx/5xx) never fall back: show `ErrorState` with Retry.
 */
export function mockAllowed(e?: unknown): boolean {
  return DEMO || isOffline(e);
}
