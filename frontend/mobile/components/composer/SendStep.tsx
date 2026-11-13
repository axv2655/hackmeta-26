import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { errorMessage } from '@/lib/backend';
import { pokePeople, previewPicks, type MoveInput } from '@/lib/composer';
import { selection, success } from '@/lib/haptics';
import { shareMove } from '@/lib/invites';
import { useMe } from '@/lib/session';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Move, NotifyPick, UserLite } from '@/lib/types';

import { Face, section } from './Chip';
import { toggleId } from './hooks';

type Props = { move: Move; input: MoveInput; onFinish: () => void };

/** Step 2: poke the people Muse picked (each with its reason and honest badge), or share a link. */
export function SendStep({ move, input, onFinish }: Props) {
  const insets = useSafeAreaInsets();
  const me = useMe();
  const [picks, setPicks] = useState<NotifyPick[] | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<NotifyPick[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const audience = useMemo(() => move.audience?.people ?? [], [move.audience]);

  useEffect(() => {
    let live = true;
    setPickError(null);
    previewPicks(move, input).then(
      (p) => {
        if (!live) return;
        setPicks(p);
        const handPicked = input.userIds.filter((id) => audience.some((a) => a.id === id));
        setChosen([...new Set([...p.map((x) => x.user.id), ...handPicked])]);
      },
      (e) => {
        if (!live) return;
        setPicks([]);
        setPickError(errorMessage(e));
      },
    );
    return () => {
      live = false;
    };
  }, [move, input, audience, attempt]);

  const pickFor = useMemo(() => new Map((picks ?? []).map((p) => [p.user.id, p])), [picks]);
  const others = audience.filter((a) => !pickFor.has(a.id));

  const send = useCallback(
    async (ids: string[]): Promise<boolean> => {
      setSending(true);
      setSendError(null);
      try {
        setSent(await pokePeople(move.id, ids));
        success();
        return true;
      } catch (e) {
        setSendError(errorMessage(e));
        return false;
      } finally {
        setSending(false);
      }
    },
    [move.id],
  );

  function done() {
    const museIds = (picks ?? []).map((p) => p.user.id);
    if (sent || museIds.length === 0) return onFinish();
    Alert.alert('Post without poking anyone?', 'Muse picked people who might pull up. They only see it on the map unless you poke them.', [
      { text: 'Skip', style: 'cancel', onPress: onFinish },
      { text: 'Poke them', onPress: () => void send(chosen.length ? chosen : museIds).then((ok) => ok && onFinish()) },
    ]);
  }

  const share = () => {
    const first = me?.first_name ?? 'A friend';
    void shareMove({ moveId: move.id, markName: move.mark.name, creatorFirst: first, inviterFirst: first });
  };

  const row = (u: UserLite) => (
    <PersonRow
      key={u.id}
      user={u}
      pick={pickFor.get(u.id)}
      on={chosen.includes(u.id)}
      poked={sent?.some((s) => s.user.id === u.id) ?? false}
      disabled={!!sent}
      onPress={() => setChosen((ids) => toggleId(ids, u.id))}
    />
  );

  const count = move.audience?.count ?? audience.length;
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.sm }]}>
      <ScreenHeader variant="compact" title="Your Move is live" backIcon="close" onBack={done} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.liveCard}>
          <Icon name="check-circle" size={22} color={colors.online} />
          <View style={styles.flex}>
            <Text style={typeScale.name} numberOfLines={2}>
              “{move.text}”
            </Text>
            <Text style={section.sub}>
              {move.mark.name} · {count} {count === 1 ? 'person' : 'people'} can see it
              {move.kind === 'flare' && input.fill ? ` · fills in ${input.fill} min` : ''}
            </Text>
          </View>
        </View>

        <Text style={section.label}>Poke them</Text>
        {picks === null ? <ActivityIndicator style={styles.loading} /> : null}
        {pickError ? (
          <PressableScale onPress={() => setAttempt((n) => n + 1)} accessibilityRole="button">
            <Text style={section.error}>Couldn't get Muse's picks: {pickError} · Tap to retry</Text>
          </PressableScale>
        ) : null}
        {picks && picks.length > 0 ? (
          <View style={styles.pickHead}>
            <Text style={section.sub}>Muse picked who's most likely to pull up.</Text>
            <MuseBadge source={picks.every((p) => p.source === 'muse') ? 'muse' : 'heuristic'} />
          </View>
        ) : null}
        {picks && picks.length === 0 && !pickError ? (
          <Text style={section.sub}>Muse didn't pick anyone this time. You can still poke people below.</Text>
        ) : null}
        {(picks ?? []).map((p) => row(p.user))}
        {picks !== null && others.length ? <Text style={styles.sublabel}>Everyone else who can see it</Text> : null}
        {picks !== null ? others.map(row) : null}

        {sent ? (
          <Text style={styles.sentNote}>
            {sent.length > 0 ? `Poked ${sent.map((p) => p.user.first_name).join(', ')}.` : 'Nobody new to poke.'}
          </Text>
        ) : (
          <Button
            title={sending ? 'Sending…' : chosen.length > 0 ? `Poke ${chosen.length}` : 'Pick someone to poke'}
            icon="bell"
            disabled={sending || chosen.length === 0 || picks === null}
            onPress={() => void send(chosen)}
          />
        )}
        {sendError ? <Text style={section.error}>{sendError}</Text> : null}

        <View style={styles.shareCard}>
          <Text style={section.label}>Friends not on Facebook?</Text>
          <Text style={section.sub}>
            Send them a link from your own phone. It opens without signing in and stops working when your Move ends.
          </Text>
          <Button title="Share link" icon="share-external" variant="secondary" onPress={share} />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Done" size="lg" fullWidth variant={sent ? 'primary' : 'secondary'} onPress={done} />
      </View>
    </View>
  );
}

type RowProps = { user: UserLite; pick?: NotifyPick; on: boolean; poked: boolean; disabled: boolean; onPress: () => void };

function PersonRow({ user, pick, on, poked, disabled, onPress }: RowProps) {
  return (
    <PressableScale
      disabled={disabled}
      onPress={() => {
        selection();
        onPress();
      }}
      style={styles.pickRow}
      scaleTo={0.98}
      accessibilityLabel={`${on ? 'Remove' : 'Add'} ${user.first_name}`}
      accessibilityState={{ selected: on }}
    >
      <Face user={user} size={40} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={typeScale.name} numberOfLines={1}>
            {user.name}
          </Text>
          {pick ? <MuseBadge source={pick.source} /> : null}
        </View>
        {poked ? <Text style={section.sub}>Poked</Text> : null}
        {!poked && pick ? <ReasonLine text={pick.reason} source={pick.source} /> : null}
        {!poked && pick?.copy ? (
          <Text style={section.meta} numberOfLines={2}>
            They'll get: “{pick.copy}”
          </Text>
        ) : null}
        {!poked && !pick ? <Text style={section.meta}>Can see it on the map</Text> : null}
      </View>
      <Icon
        name={poked || on ? 'check-circle' : 'plus-circle'}
        size={24}
        color={poked ? colors.online : on ? colors.blue : colors.textSecondary}
      />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  body: { padding: spacing.lg, gap: spacing.md },
  loading: { marginVertical: spacing.lg },
  liveCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  pickHead: { gap: spacing.xs },
  sublabel: { ...typeScale.label, color: colors.textSecondary, marginTop: spacing.sm },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  sentNote: { ...typeScale.body, color: colors.online, fontWeight: '600' },
  shareCard: { gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
