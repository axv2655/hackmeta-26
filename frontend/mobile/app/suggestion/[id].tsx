import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { SuggestionView } from '@/components/muse/SuggestionView';
import { isOpen } from '@/components/muse/suggestionCopy';
import { serverNow } from '@/lib/format';
import { useSuggestions } from '@/lib/suggestions';
import { colors } from '@/lib/theme';
import type { Suggestion } from '@/lib/types';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; suggestion: Suggestion }
  | { kind: 'gone' }
  | { kind: 'error'; message: string };

/**
 * A Muse suggestion (opened from a muse_* notification, the banner, a push,
 * the Home or Moves Muse card, or Demo Control). Shows Muse's reasoning and
 * waits for the user's tap: nothing is posted or sent from here otherwise.
 */
export default function SuggestionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ensure = useSuggestions((s) => s.ensure);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!id) {
      setState({ kind: 'gone' });
      return;
    }
    setState({ kind: 'loading' });
    const found = await ensure(id);
    if (found && isOpen(found, serverNow())) {
      setState({ kind: 'ready', suggestion: found });
      return;
    }
    const { status, error } = useSuggestions.getState();
    if (!found && status === 'error') setState({ kind: 'error', message: error ?? 'Something went wrong' });
    else setState({ kind: 'gone' });
  }, [id, ensure]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.page}>
      <ScreenHeader variant="compact" title="Muse" backIcon="close" onBack={close} />
      {state.kind === 'loading' ? <LoadingState label="Loading suggestion" variant="detail" /> : null}
      {state.kind === 'error' ? <ErrorState message={state.message} onRetry={() => void load()} /> : null}
      {state.kind === 'gone' ? (
        <EmptyState
          icon="clock"
          title="This suggestion has expired"
          body="Muse will suggest something else when the timing is right."
          action={{ label: 'Close', onPress: close }}
        />
      ) : null}
      {state.kind === 'ready' ? <SuggestionView suggestion={state.suggestion} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
});
