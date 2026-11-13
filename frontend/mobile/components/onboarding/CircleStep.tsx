import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CircleFields } from '@/components/circles/CircleFields';
import { MemberPicker } from '@/components/circles/MemberPicker';
import { useCircleDraft } from '@/components/circles/useCircleDraft';
import { useFriendList } from '@/components/circles/useFriendList';
import { useCircles } from '@/lib/circles';
import { success } from '@/lib/haptics';
import { spacing, type as typeScale } from '@/lib/theme';

import { OnboardingFrame } from './OnboardingFrame';
import type { StepProps } from './steps';

/** Card 4: make a first Circle (or skip). Friends confirmed on card 3 show up here. */
export function CircleStep({ step, total, next, finish }: StepProps) {
  const draft = useCircleDraft();
  const friends = useFriendList();
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!draft.valid || saving) return;
    setSaving(true);
    const saved = await useCircles.getState().create(draft.input(), draft.members);
    setSaving(false);
    if (saved) {
      success();
      next();
    }
  };

  return (
    <OnboardingFrame
      step={step}
      total={total}
      icon="users"
      title="Pick who sees your Moves"
      body="A Circle is a group you share with in one tap, like roommates or your climbing group. Only the people in it see those Moves."
      primary={{
        label: saving ? 'Creating...' : draft.valid ? 'Create Circle' : 'Name your Circle',
        onPress: create,
        disabled: !draft.valid || saving,
      }}
      onNotNow={next}
      onSkipAll={finish}
    >
      <View style={styles.bleed}>
        <CircleFields draft={draft} />
        <Text style={styles.section}>Members</Text>
        <MemberPicker list={friends} selected={draft.selected} onToggle={draft.toggle} />
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -spacing.lg },
  section: { ...typeScale.sectionTitle, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
});
