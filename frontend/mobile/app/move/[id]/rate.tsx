import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { CompareStep } from '@/components/ratings/CompareStep';
import { FaceStep } from '@/components/ratings/FaceStep';
import { RatingResultCard } from '@/components/ratings/RatingResultCard';
import { VibeStep } from '@/components/ratings/VibeStep';
import { useRateFlow, type RateFlow } from '@/lib/ratings';
import { colors, spacing, type as typeScale } from '@/lib/theme';

function SkipButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" style={styles.skip}>
      <Text style={styles.skipText}>Skip</Text>
    </Pressable>
  );
}

/** What "Skip" does on each step; null hides it. */
function skipAction(flow: RateFlow, close: () => void): (() => void) | null {
  switch (flow.step.kind) {
    case 'face':
      return close;
    case 'compare':
      return flow.step.asking ? null : flow.skipCompare;
    case 'vibes':
      return flow.step.submitting ? null : flow.submit;
    default:
      return null;
  }
}

function Body({ flow, close, toBoard }: { flow: RateFlow; close: () => void; toBoard: () => void }) {
  const { step, questions } = flow;
  if (step.kind === 'loading') return <LoadingState label="Getting your list" />;
  if (step.kind === 'error') {
    return <ErrorState message={step.message} onRetry={step.restart ? flow.reload : flow.submit} />;
  }
  if (step.kind === 'not_allowed') {
    return (
      <EmptyState
        icon="lock"
        title="Only people at this Move can rank it"
        body="Pull up next time and you can rank the spot after."
        action={{ label: 'Close', onPress: close }}
      />
    );
  }
  if (step.kind === 'already') {
    const name = questions?.mark.name ?? 'this spot';
    return (
      <EmptyState
        icon="check-circle"
        title={`You already ranked ${name}`}
        body="It's on your list."
        action={{ label: 'See leaderboard', onPress: toBoard }}
      />
    );
  }
  if (step.kind === 'result') {
    return <RatingResultCard result={step.result} taste={step.taste} onLeaderboard={toBoard} onDone={close} />;
  }
  if (!questions) return <LoadingState />;
  if (step.kind === 'face') return <FaceStep questions={questions} onPick={flow.pickFace} />;
  if (step.kind === 'compare') {
    return (
      <CompareStep
        mark={questions.mark}
        other={step.other}
        index={flow.answers.length}
        asking={step.asking}
        onAnswer={flow.answer}
      />
    );
  }
  return (
    <VibeStep
      markName={questions.mark.name}
      options={questions.vibe_tags}
      tags={flow.tags}
      note={flow.note}
      submitting={step.submitting}
      onToggle={flow.toggleTag}
      onNote={flow.setNote}
      onSubmit={flow.submit}
    />
  );
}

/** `/move/[id]/rate`: rank the Move's spot in a few taps. Every step can be skipped. */
export default function RateMoveScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const moveId = String(raw ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flow = useRateFlow(moveId);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const category = flow.step.kind === 'result' ? flow.step.result.category : flow.questions?.category;
  const toBoard = () =>
    router.replace(category ? { pathname: '/leaderboards', params: { category } } : '/leaderboards');
  const skip = skipAction(flow, close);
  const centered = ['loading', 'error', 'not_allowed', 'already'].includes(flow.step.kind);

  return (
    <View style={styles.page}>
      <ScreenHeader
        variant="compact"
        title={flow.step.kind === 'result' ? 'Ranked' : 'Rank this spot'}
        backIcon="close"
        onBack={close}
        right={skip ? <SkipButton onPress={skip} /> : undefined}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[centered && styles.center, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Body flow={flow} close={close} toBoard={toBoard} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  center: { flexGrow: 1 },
  skip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  skipText: { ...typeScale.button, color: colors.blue },
});
