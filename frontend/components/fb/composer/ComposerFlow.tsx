import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/lib/theme';

import { ComposeScreen } from './ComposeScreen';
import { useComposerStore } from './draftStore';
import { ShareScreen } from './ShareScreen';

type Step = 'compose' | 'share';

// Matches the feel of a native push: fast start, long settle.
const EASE_PUSH = Easing.bezier(0.32, 0.72, 0, 1);
const PUSH_MS = 350;
const POP_MS = 300;
/** How far the screen underneath drifts left while the next one covers it. */
const PARALLAX = 0.3;

/**
 * The whole create-post flow inside one route: Create post, then New post.
 *
 * The second step is not a separate stack route on purpose. `post/new` is a
 * fullScreenModal, and on iOS the native stack pushes any non-modal screen
 * *underneath* a presented modal, so `router.push('/post/share')` from here
 * would be invisible. The step slides in over the composer instead; the
 * `/post/share` route still renders the same ShareScreen on its own.
 */
export function ComposerFlow() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>('compose');
  // The share step stays mounted until it has finished sliding away.
  const [shareMounted, setShareMounted] = useState(false);
  const progress = useSharedValue(0);

  // Leaving the flow (closed or posted) always ends the draft.
  useEffect(() => () => useComposerStore.getState().reset(), []);

  useEffect(() => {
    if (step === 'share') {
      progress.set(withTiming(1, { duration: reduceMotion ? 0 : PUSH_MS, easing: EASE_PUSH }));
      return;
    }
    progress.set(
      withTiming(0, { duration: reduceMotion ? 0 : POP_MS, easing: EASE_PUSH }, (finished) => {
        if (finished) scheduleOnRN(setShareMounted, false);
      }),
    );
  }, [progress, reduceMotion, step]);

  const goToShare = useCallback(() => {
    Keyboard.dismiss();
    setShareMounted(true);
    setStep('share');
  }, []);

  const backToCompose = useCallback(() => setStep('compose'), []);

  const close = useCallback(() => {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // Android back: step back to the composer before leaving the flow.
  useEffect(() => {
    if (step !== 'share') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('compose');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const composeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.get() * width * PARALLAX }],
  }));
  const shareStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.get()) * width }],
  }));

  const covered = step === 'share';

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.pane, { pointerEvents: covered ? 'none' : 'auto' }, composeStyle]}
        aria-hidden={covered}
        accessibilityElementsHidden={covered}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
      >
        <ComposeScreen onClose={close} onNext={goToShare} />
      </Animated.View>

      {shareMounted ? (
        <Animated.View style={[styles.pane, { pointerEvents: covered ? 'auto' : 'none' }, shareStyle]}>
          <ShareScreen onBack={backToCompose} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the off-screen pane so the web page never scrolls sideways.
  root: { flex: 1, backgroundColor: colors.white, overflow: 'hidden' },
  pane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.white,
  },
});

export default ComposerFlow;
