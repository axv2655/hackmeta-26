import { requireOptionalNativeModule } from 'expo';

type Subscription = { remove: () => void };

export type MovesBleNative = {
  isSupported(): boolean;
  start(uuid: string): void;
  stop(): void;
  addListener(
    event: 'onSighting',
    cb: (e: { uuid: string; rssi: number }) => void,
  ): Subscription;
  addListener(
    event: 'onState',
    cb: (e: { state: string }) => void,
  ): Subscription;
};

/** The native radio, or null in Expo Go, on web, or a build made before it was added. */
export const MovesBle: MovesBleNative | null = (() => {
  try {
    return requireOptionalNativeModule<MovesBleNative>('MovesBle');
  } catch {
    return null;
  }
})();
