import { useCallback, useRef, useState, type ComponentType } from 'react';
import { useRouter } from 'expo-router';

import { CircleStep } from '@/components/onboarding/CircleStep';
import { FriendsStep } from '@/components/onboarding/FriendsStep';
import { CalendarStep, ExplainerStep, LocationStep, type StepProps } from '@/components/onboarding/steps';
import { markOnboarded } from '@/components/onboarding/storage';
import { useSession } from '@/lib/session';

const STEPS: ComponentType<StepProps>[] = [ExplainerStep, LocationStep, CalendarStep, FriendsStep, CircleStep];

/** First run after sign-up: five cards, each skippable. Finishing or skipping lands on Home. */
export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const done = useRef(false);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    void markOnboarded();
    useSession.getState().clearJustSignedUp();
    router.replace('/');
  }, [router]);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) finish();
    else setStep(step + 1);
  }, [step, finish]);

  const Step = STEPS[step];
  return <Step step={step} total={STEPS.length} next={next} finish={finish} />;
}
