import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { PersonRow } from '@/components/friends/PersonRow';
import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { useFriends } from '@/lib/friends';
import type { Person } from '@/lib/types';
import { colors, spacing, type as typeScale } from '@/lib/theme';

import { OnboardingFrame } from './OnboardingFrame';
import type { StepProps } from './steps';

type Load = { people: Person[]; status: 'loading' | 'ready' | 'error'; error: string | null };

function mutualLine(n: number): string | undefined {
  return n > 0 ? `${n} mutual ${n === 1 ? 'friend' : 'friends'}` : undefined;
}

/** People you may know, from `GET /friends/suggestions`. */
function useSuggestedPeople(): Load & { reload: () => void } {
  const [state, setState] = useState<Load>({ people: [], status: 'loading', error: null });
  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    endpoints.friends
      .suggestions(8)
      .then((people) => setState({ people, status: 'ready', error: null }))
      .catch((e: unknown) => setState({ people: [], status: 'error', error: errorMessage(e) }));
  }, []);
  useEffect(reload, [reload]);
  return { ...state, reload };
}

/** Card 3: confirm the requests waiting for you and add a few people. */
export function FriendsStep({ step, total, next, finish }: StepProps) {
  const incoming = useFriends((s) => s.incoming);
  const loaded = useFriends((s) => s.loaded);
  const suggested = useSuggestedPeople();

  useEffect(() => {
    void useFriends.getState().load();
  }, []);

  const incomingIds = new Set(incoming.map((p) => p.user.id));
  const people = suggested.people.filter((p) => !incomingIds.has(p.user.id));

  return (
    <OnboardingFrame
      step={step}
      total={total}
      icon="user-plus"
      title="Find your friends"
      body="Moves only go to people you add. Confirm the people you know."
      primary={{ label: 'Next', onPress: next }}
      onNotNow={next}
      onSkipAll={finish}
    >
      <View style={styles.bleed}>
        <Text style={styles.section}>Friend requests</Text>
        {!loaded ? (
          <LoadingState label="Loading requests" rows={2} style={styles.state} />
        ) : incoming.length ? (
          incoming.map((p) => <PersonRow key={p.user.id} person={p} subtitle="Wants to be friends" />)
        ) : (
          <Text style={styles.none}>No requests right now.</Text>
        )}

        <Text style={styles.section}>People you may know</Text>
        {suggested.status === 'loading' ? (
          <LoadingState label="Finding people" rows={4} style={styles.state} />
        ) : suggested.status === 'error' ? (
          <ErrorState message={suggested.error ?? 'Could not load people'} onRetry={suggested.reload} style={styles.state} />
        ) : people.length ? (
          people.map((p) => <PersonRow key={p.user.id} person={p} subtitle={mutualLine(p.mutual_count)} />)
        ) : (
          <EmptyState icon="users" title="No one to suggest yet" body="Search for friends by name later." style={styles.state} />
        )}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -spacing.lg },
  section: { ...typeScale.sectionTitle, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  state: { flex: 0, paddingVertical: spacing.lg },
  none: { ...typeScale.rowSub, color: colors.textSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
