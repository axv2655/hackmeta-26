import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { useLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';

import { Bullet } from './Bullet';
import { OnboardingFrame } from './OnboardingFrame';

export type StepProps = {
  step: number;
  total: number;
  /** Go to the next card (or finish after the last). */
  next: () => void;
  /** Leave onboarding now. */
  finish: () => void;
};

/** Card 1: what a Move is. */
export function ExplainerStep({ step, total, next, finish }: StepProps) {
  return (
    <OnboardingFrame
      step={step}
      total={total}
      icon="moves"
      title="Share what you're already doing"
      body="Moves is for plans you already have. Post one in a tap and friends can join you."
      primary={{ label: 'Next', onPress: next }}
      onNotNow={next}
      onSkipAll={finish}
    >
      <View>
        <Bullet icon="map-pin" title="Post a Move" body={'"Going to Chipotle." A place and a line, that\'s it.'} />
        <Bullet icon="users" title="Friends pull up" body="One tap and they're on their way. No group chat needed." />
        <Bullet icon="sparkles" title="Muse helps, you decide" body="Muse suggests who to tell and when. Nothing goes out without your tap." />
        <Bullet icon="eye" title="You always see who sees it" body="Every Move shows its audience before you post." />
      </View>
    </OnboardingFrame>
  );
}

/** Card 2: location primer. Saves the opt-in first, then asks the OS. */
export function LocationStep({ step, total, next, finish }: StepProps) {
  const [busy, setBusy] = useState(false);

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await endpoints.me.settings({ location_opt_in: true });
      void useSession.getState().refreshMe();
    } catch (e) {
      toast(errorMessage(e));
    }
    await useLocation.getState().start();
    setBusy(false);
    if (useLocation.getState().permission !== 'granted') toast('Location is off. You can turn it on later in Settings.');
    next();
  };

  return (
    <OnboardingFrame
      step={step}
      total={total}
      icon="location"
      title="A place, not you"
      body="Location finds places near you. Friends see the place you post, never where you are."
      primary={{ label: busy ? 'Turning on...' : 'Turn on location', onPress: turnOn, disabled: busy }}
      onNotNow={next}
      onSkipAll={finish}
    >
      <View>
        <Bullet icon="eye-off" title="No live location" body="Moves never shows your position on a map." />
        <Bullet icon="lock" title="Stays on your phone" body="Only a rough area is sent to find nearby places, and it isn't stored." />
        <Bullet icon="settings" title="Optional" body="Everything works without it. Change it any time in Settings." />
      </View>
    </OnboardingFrame>
  );
}
