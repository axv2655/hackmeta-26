import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { appEvents } from '@/lib/events';
import { shareMove } from '@/lib/invites';
import { useMoveDetail } from '@/lib/moveDetail';
import { myFirstName, useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { spacing, type as typeScale } from '@/lib/theme';
import type { Move } from '@/lib/types';

type Confirm = { title: string; body: string; ok: string; destructive?: boolean; run: () => void };

function confirm({ title, body, ok, destructive, run }: Confirm): void {
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: ok, style: destructive ? 'destructive' : 'default', onPress: run },
  ]);
}

function leaveBody(ghostVisible: boolean): string {
  return ghostVisible
    ? 'Friends who can see this Move will see a ghost of you here for a day.'
    : 'Your ghost is turned off in privacy settings, so nothing stays behind.';
}

/** The buttons that fit where I stand with this Move. */
export function MoveActions({ move }: { move: Move }) {
  const router = useRouter();
  const myId = useSession((s) => s.userId);
  const ghostVisible = useSession((s) => s.me?.settings.ghost_visible ?? true);
  const busy = useMoveDetail((s) => Boolean(s.busy[move.id]));
  const { join, withdraw, arrive, leave, end } = useMoveDetail.getState();

  const id = move.id;
  const mine = move.creator.id === myId;
  const live = move.status === 'live';
  const my = move.my_status;

  const onShare = async () => {
    const sent = await shareMove({
      moveId: id,
      markName: move.mark.name,
      creatorFirst: move.creator.first_name,
      inviterFirst: myFirstName('A friend'),
    });
    appEvents.emit('invites.changed', { move_id: id });
    if (sent) toast('Link sent');
  };

  const onLeave = () =>
    confirm({
      title: 'Leave this Move?',
      body: leaveBody(ghostVisible),
      ok: 'Leave',
      run: () => void leave(id, false).then((ok) => ok && toast('You left')),
    });

  const onLeaveQuietly = () =>
    confirm({
      title: 'Leave quietly?',
      body: 'No ghost stays behind and nobody is notified.',
      ok: 'Leave quietly',
      run: () => void leave(id, true).then((ok) => ok && toast('You left quietly')),
    });

  const onEnd = () =>
    confirm({
      title: 'End this Move?',
      body: ghostVisible
        ? 'It ends for everyone. People still there leave a ghost here for a day.'
        : 'It ends for everyone. People still there leave a ghost here for a day (yours is turned off).',
      ok: 'End Move',
      destructive: true,
      run: () => void end(id).then((ok) => ok && toast('Move ended')),
    });

  if (!live) {
    return (
      <View style={styles.wrap}>
        {my ? (
          <Button title="Rate it" icon="star" size="lg" onPress={() => router.push(`/move/${id}/rate`)} />
        ) : (
          <Text style={typeScale.meta}>You weren't part of this one.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!mine && my === null ? (
        <Button title="Pull up" icon="navigation" size="lg" disabled={busy} onPress={() => void join(id)} />
      ) : null}
      {my === 'going' ? (
        <View style={styles.row}>
          <Button title="I'm here" icon="map-pin" size="lg" style={styles.flex} disabled={busy} onPress={() => void arrive(id)} />
          {!mine ? (
            <Button
              title="Take it back"
              variant="secondary"
              size="lg"
              style={styles.flex}
              disabled={busy}
              onPress={() => void withdraw(id).then((ok) => ok && toast('Took back your Pull up'))}
            />
          ) : null}
        </View>
      ) : null}
      {my === 'there' && !mine ? (
        <View style={styles.row}>
          <Button title="Leave" variant="secondary" size="lg" style={styles.flex} disabled={busy} onPress={onLeave} />
          <Button
            title="Leave quietly"
            variant="secondary"
            size="lg"
            style={styles.flex}
            disabled={busy}
            onPress={onLeaveQuietly}
          />
        </View>
      ) : null}
      {my === 'left' && !mine ? <Text style={typeScale.meta}>You left this Move.</Text> : null}
      <View style={styles.row}>
        <Button title="Share" icon="share" variant="tinted" style={styles.flex} onPress={() => void onShare()} />
        {mine ? (
          <Button title="End Move" variant="secondary" style={styles.flex} disabled={busy} onPress={onEnd} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
