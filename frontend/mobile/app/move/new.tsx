import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { OfflineBar } from '@/components/common/OfflineBar';
import { AudienceLine } from '@/components/composer/AudienceLine';
import { AudiencePicker } from '@/components/composer/AudiencePicker';
import { section } from '@/components/composer/Chip';
import { useDebouncedQuery } from '@/components/composer/hooks';
import { OpenFillControls } from '@/components/composer/OpenFillControls';
import { PlacePicker } from '@/components/composer/PlacePicker';
import { SendStep } from '@/components/composer/SendStep';
import { useComposerForm, type ComposerForm } from '@/components/composer/useComposerForm';
import { WhatField } from '@/components/composer/WhatField';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { errorMessage } from '@/lib/backend';
import { parsePrefill, postMove, previewAudience, type ComposerData, type MoveInput, type Prefill } from '@/lib/composer';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { success } from '@/lib/haptics';
import { useLocation } from '@/lib/location';
import type { ComposerParams } from '@/lib/nav';
import { colors, radius, spacing } from '@/lib/theme';
import type { Circle, Move } from '@/lib/types';

/**
 * Make a Move (ARCHITECTURE.md 7.2), in two steps.
 *
 *   1. Compose: where, what (Muse's draft, honestly labelled), who (Circles,
 *      usual crews, friends; the server says exactly who will see it), Open
 *      and Fill. "Make Move" posts it with nobody poked yet.
 *   2. Send: Muse's picks for who to poke, each with a reason. Done opens the
 *      Move's detail page.
 *
 * Opened with `ComposerParams` (lib/nav) from the map, Home, Reels, a Mark,
 * a crew or an accepted suggestion.
 */
export default function NewMoveScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ComposerParams>();
  const [prefill] = useState(() => parsePrefill(params));
  const form = useComposerForm(prefill);
  const [posted, setPosted] = useState<{ move: Move; input: MoveInput } | null>(null);

  useEffect(() => {
    // Asked in context: where you are picks the nearest place. Denied still works.
    void useLocation.getState().start();
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/moves'));
  const finish = (id: string) => {
    appEvents.emit('moves.changed', { move_id: id });
    router.replace(`/move/${encodeURIComponent(id)}`);
  };

  if (posted) return <SendStep move={posted.move} input={posted.input} onFinish={() => finish(posted.move.id)} />;

  const { phase } = form;
  return (
    <ComposeChrome onClose={close}>
      {phase.kind === 'loading' ? <LoadingState label="Getting your Move ready" /> : null}
      {phase.kind === 'error' ? <ErrorState message={phase.message} onRetry={form.retry} /> : null}
      {phase.kind === 'ready' ? (
        <ComposeBody
          data={phase.data}
          form={form}
          prefill={prefill}
          onPosted={(move, input) => {
            appEvents.emit('moves.changed', { move_id: move.id });
            setPosted({ move, input });
          }}
        />
      ) : null}
    </ComposeChrome>
  );
}

function ComposeChrome({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.sm }]}>
      <ScreenHeader variant="compact" title="Make a Move" backIcon="close" onBack={onClose} />
      <OfflineBar />
      {children}
    </View>
  );
}

type BodyProps = {
  data: ComposerData;
  form: ComposerForm;
  prefill: Prefill;
  onPosted: (move: Move, input: MoveInput) => void;
};

/** Keeps Circles fresh when the user comes back from "New Circle". */
function useCircles(initial: Circle[], live: boolean): Circle[] {
  const [circles, setCircles] = useState(initial);
  useFocusEffect(
    useCallback(() => {
      if (!live) return;
      let active = true;
      endpoints.circles.list().then(
        (c) => active && setCircles(c),
        () => undefined, // Keep the list we have; the audience line still checks with the server.
      );
      return () => {
        active = false;
      };
    }, [live]),
  );
  return circles;
}

function ComposeBody({ data, form, prefill, onPosted }: BodyProps) {
  const circles = useCircles(data.circles, !data.sample);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = form.circleIds.length + form.userIds.length > 0;
  const audienceKey = `${[...form.circleIds].sort().join(',')}|${[...form.userIds].sort().join(',')}`;
  const preview = useDebouncedQuery(
    audienceKey,
    () => previewAudience(form.circleIds, form.userIds),
    picked && !data.sample,
  );

  const audienceOk = !!preview.data && preview.data.count > 0 && !preview.loading && !preview.error;
  const text = form.text.trim();
  const canPost = !data.sample && !!form.place && text.length > 0 && picked && audienceOk && !posting;

  async function make() {
    if (!form.place || !canPost) return;
    const input: MoveInput = {
      place: form.place,
      text,
      category: form.category,
      circleIds: form.circleIds,
      userIds: form.userIds,
      open: form.open,
      fill: form.fill,
      origin: prefill.origin,
      originRef: prefill.originRef,
    };
    setPosting(true);
    setError(null);
    try {
      const move = await postMove(input);
      success();
      onPosted(move, input);
    } catch (e) {
      setError(errorMessage(e));
      setPosting(false);
    }
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {data.sample ? (
          <View style={styles.sample}>
            <Text style={section.sub}>Sample data: you're offline, so this Move can't be posted.</Text>
          </View>
        ) : null}
        <PlacePicker
          places={form.places}
          place={form.place}
          onChoose={form.choosePlace}
          category={form.category}
          userIds={form.userIds}
          sample={data.sample}
          confirmPlace={form.confirmPlace}
          onConfirmYes={form.confirmYes}
        />
        <WhatField
          text={form.text}
          onText={form.setText}
          edited={form.edited}
          alternates={form.alternates}
          category={form.category}
          onCategory={form.setCategory}
          muse={form.muse}
          source={form.draftSource}
        />
        <AudiencePicker
          circles={circles}
          crews={data.crews}
          friends={data.friends}
          circleIds={form.circleIds}
          userIds={form.userIds}
          onCircles={form.setCircleIds}
          onUsers={form.setUserIds}
          sample={data.sample}
        />
        <OpenFillControls open={form.open} onOpen={form.setOpen} fill={form.fill} onFill={form.setFill} />
        <AudienceLine preview={preview} picked={picked} open={form.open} sample={data.sample} />
        {!form.place ? <Text style={section.sub}>Pick a place to post your Move.</Text> : null}
        {error ? <Text style={section.error}>Not posted: {error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={data.sample ? "Not posted: you're offline" : posting ? 'Posting…' : form.fill ? 'Send Flare' : 'Make Move'}
          icon="moves-filled"
          size="lg"
          fullWidth
          disabled={!canPost}
          onPress={make}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  body: { padding: spacing.lg, gap: spacing.md },
  sample: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
