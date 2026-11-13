import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appEvents } from '@/lib/events';
import { composerHref, draftToComposer } from '@/lib/nav';
import { useSession } from '@/lib/session';
import { useSuggestions } from '@/lib/suggestions';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { AcceptResult, Suggestion, SuggestionEdits } from '@/lib/types';

import { FillStepper, clampFill } from './FillStepper';
import { InviteeList, inviteesFrom } from './InviteeList';
import { ReasoningCard } from './ReasoningCard';
import { SuggestionActions, type SuggestionBusy } from './SuggestionActions';
import { originFor, postsDirectly, primaryLabel } from './suggestionCopy';

export type SuggestionViewProps = { suggestion: Suggestion };

const toggled = (set: ReadonlySet<string>, id: string, on: boolean): Set<string> => {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
};

function acceptToast(s: Suggestion, fill: number): string {
  if (s.type === 'flare') return `Flare sent · fills in ${fill} min`;
  if (s.type === 'nobody_bit') return "You're going";
  return 'Move posted';
}

/**
 * A pending Muse suggestion with everything the user can change before
 * saying yes: who hears about it, the fill time (Flares) and the text (when
 * accepting posts the Move straight away). Muse proposes, the user disposes.
 */
export function SuggestionView({ suggestion: s }: SuggestionViewProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const known = useSession((st) => st.users);
  const accept = useSuggestions((st) => st.accept);
  const dismiss = useSuggestions((st) => st.dismiss);

  const joinsExisting = s.type === 'nobody_bit' && Boolean(s.target_move_id);
  const invitees = useMemo(() => (joinsExisting ? [] : inviteesFrom(s.draft, known)), [s.draft, known, joinsExisting]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(invitees.map((i) => i.user.id)));
  const [fill, setFill] = useState(() => clampFill(s.fill_minutes ?? s.draft?.fill_minutes));
  const [text, setText] = useState(s.draft?.text ?? '');
  const [busy, setBusy] = useState<SuggestionBusy>(null);

  const editable = postsDirectly(s);
  const blockedReason =
    invitees.length > 0 && selected.size === 0
      ? 'Pick at least one person'
      : editable && !text.trim()
        ? 'Add a few words about the Move'
        : null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const edits = (): SuggestionEdits => ({
    ...(invitees.length ? { user_ids: invitees.map((i) => i.user.id).filter((id) => selected.has(id)) } : {}),
    ...(s.type === 'flare' ? { fill_minutes: fill } : {}),
    ...(s.draft && text.trim() ? { text: text.trim() } : {}),
  });

  const onAccepted = (result: AcceptResult) => {
    if (result.move_id) {
      appEvents.emit('moves.changed');
      toast(acceptToast(s, fill));
      router.replace(`/move/${encodeURIComponent(result.move_id)}` as Href);
    } else if (result.draft) {
      router.replace(composerHref(draftToComposer(result.draft, originFor(s.type), s.id)));
    } else {
      toast('Done');
      close();
    }
  };

  const onAccept = async () => {
    setBusy('accept');
    try {
      onAccepted(await accept(s.id, edits()));
    } catch {
      // The store already showed the error and put the suggestion back.
      setBusy(null);
    }
  };

  const onDismiss = async (neverAgain: boolean) => {
    setBusy(neverAgain ? 'never' : 'dismiss');
    await dismiss(s.id, neverAgain);
    if (neverAgain) toast("Muse won't suggest this crew again");
    close();
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ReasoningCard suggestion={s} onSeeDay={() => router.push('/calendar' as Href)} />
        {editable ? (
          <View style={styles.block}>
            <Text style={styles.label}>Your Move</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              style={styles.input}
              multiline
              maxLength={280}
              placeholder="What are you doing?"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Move text"
            />
          </View>
        ) : null}
        {s.type === 'flare' ? <FillStepper value={fill} onChange={setFill} /> : null}
        {invitees.length ? (
          <InviteeList
            invitees={invitees}
            selected={selected}
            onToggle={(id, on) => setSelected((cur) => toggled(cur, id, on))}
          />
        ) : null}
        {s.type === 'revive' ? (
          <Pressable onPress={() => router.push('/groups' as Href)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.link}>See your crews</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <SuggestionActions
          primary={primaryLabel(s)}
          busy={busy}
          blockedReason={blockedReason}
          showNeverAgain={s.type === 'revive'}
          onAccept={onAccept}
          onDismiss={() => void onDismiss(false)}
          onNeverAgain={() => void onDismiss(true)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.lg, gap: spacing.xl },
  block: { gap: spacing.sm },
  label: { ...typeScale.sectionTitle },
  input: {
    ...typeScale.body,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  link: { ...typeScale.button, color: colors.blue },
  footer: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});

export default SuggestionView;
