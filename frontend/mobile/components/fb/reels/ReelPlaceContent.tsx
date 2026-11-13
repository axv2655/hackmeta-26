import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { errorMessage } from '@/lib/backend';
import { categoryMeta } from '@/lib/categories';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { success } from '@/lib/haptics';
import { composerHref, draftToComposer } from '@/lib/nav';
import { toUser } from '@/lib/people';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { ReelActiveMove, ReelPlace } from '@/lib/types';

import { milesLabel } from './PlaceChip';

type Close = () => void;

/** Place name (taps through to the Mark), category, distance and the "Is this it?" line. */
export function PlaceHeader({ place, onClose }: { place: ReelPlace; onClose: Close }) {
  const router = useRouter();
  const mark = place.mark;
  if (!mark) {
    return (
      <View style={styles.header}>
        <Text style={styles.title}>We couldn&apos;t pin this place</Text>
        <Text style={styles.sub}>You can still start a Move and pick the place yourself.</Text>
      </View>
    );
  }
  const meta = categoryMeta(mark.category);
  const openMark = () => {
    onClose();
    router.push(`/mark/${encodeURIComponent(mark.id)}`);
  };
  return (
    <View style={styles.header}>
      <PressableScale onPress={openMark} scaleTo={0.98} accessibilityLabel={`Open ${mark.name}`} style={styles.nameRow}>
        <Icon name="map-pin" size={18} color={colors.blue} />
        <Text style={styles.title} numberOfLines={1}>
          {mark.name}
        </Text>
        <Icon name="chevron-right" size={18} color={colors.textSecondary} />
      </PressableScale>
      <Text style={styles.sub} numberOfLines={1}>
        {[meta.label, place.distance_mi != null ? milesLabel(place.distance_mi) : null, mark.address]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {place.confirm_place ? (
        <View style={styles.confirm}>
          <MuseBadge source={place.draft?.source} label="Muse matched" />
          <Text style={styles.confirmText}>Is this {mark.name}? Check before you post.</Text>
        </View>
      ) : null}
    </View>
  );
}

function FriendsRow({ move }: { move: ReelActiveMove }) {
  const people = move.friends_there.length > 0 ? move.friends_there : [move.creator];
  return (
    <View style={styles.avatars}>
      {people.slice(0, 5).map((u, i) => (
        <Avatar
          key={u.id}
          source={toUser(u).avatar}
          size={36}
          accessibilityLabel={u.name}
          style={i > 0 ? styles.overlap : undefined}
        />
      ))}
      <Text style={styles.sub} numberOfLines={1}>
        {move.participants_count} {move.participants_count === 1 ? 'person' : 'people'} on this Move
      </Text>
    </View>
  );
}

/** State A: a live Move at this place. One tap to pull up. */
export function ActiveMoveState({ place, move, onClose }: { place: ReelPlace; move: ReelActiveMove; onClose: Close }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const joined = move.my_status === 'going' || move.my_status === 'there';
  const openMove = () => {
    onClose();
    router.push(`/move/${encodeURIComponent(move.id)}`);
  };
  const pullUp = async () => {
    setBusy(true);
    try {
      await endpoints.moves.join(move.id);
      success();
      toast(`You're going. ${move.creator.first_name} will see you pulled up.`);
      appEvents.emit('moves.changed', { move_id: move.id });
      openMove();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.section}>
      <Text style={styles.headline}>{place.headline}</Text>
      <FriendsRow move={move} />
      <View style={styles.quote}>
        <Text style={styles.quoteName}>{move.creator.first_name}</Text>
        <Text style={styles.quoteText}>{move.text}</Text>
      </View>
      {joined ? (
        <Button title="You're going · Open Move" icon="check" onPress={openMove} size="lg" fullWidth />
      ) : (
        <>
          <Button title={busy ? 'Pulling up…' : "I'm going"} onPress={pullUp} disabled={busy} size="lg" fullWidth />
          <Button title="Open Move" variant="secondary" onPress={openMove} fullWidth />
        </>
      )}
    </View>
  );
}

/** State B: nobody is there. Muse's draft (or the caption, if Muse ran out of time) seeds the composer. */
export function StartMoveState({ place, caption, onClose }: { place: ReelPlace; caption: string; onClose: Close }) {
  const router = useRouter();
  const draft = place.draft;
  const markId = place.mark?.id ?? draft?.mark?.id;
  const start = () => {
    const params = draft
      ? { ...draftToComposer(draft, 'reel', place.reel_id), mark_id: markId }
      : { mark_id: markId, seed_text: caption, origin: 'reel' as const, origin_ref: place.reel_id };
    onClose();
    router.push(composerHref(params));
  };
  return (
    <View style={styles.section}>
      <Text style={styles.headline}>{place.headline || 'Start a Move here'}</Text>
      {draft ? (
        <>
          <View style={styles.draft}>
            <MuseBadge source={draft.source} label="Muse drafted" />
            <Text style={styles.quoteText}>{draft.text}</Text>
          </View>
          {draft.notify.length > 0 ? (
            <View style={styles.picks}>
              <Text style={styles.label}>Muse would tell</Text>
              {draft.notify.slice(0, 4).map((pick) => (
                <View key={pick.user.id} style={styles.pick}>
                  <Avatar source={toUser(pick.user).avatar} size={32} accessibilityLabel={pick.user.name} />
                  <View style={styles.pickText}>
                    <Text style={styles.pickName} numberOfLines={1}>
                      {pick.user.name}
                    </Text>
                    <ReasonLine text={pick.reason} source={pick.source} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.draft}>
          <MuseBadge />
          <Text style={styles.sub}>Muse will draft it when you open the composer.</Text>
        </View>
      )}
      <Button title="Start a Move here" icon="plus" onPress={start} size="lg" fullWidth />
      <Text style={styles.fine}>Nothing posts until you tap Post.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', maxWidth: '100%' },
  title: { ...typeScale.screenTitle, fontSize: 22, lineHeight: 28, flexShrink: 1 },
  sub: { ...typeScale.rowSub, flexShrink: 1 },
  confirm: { marginTop: spacing.sm, gap: spacing.xs },
  confirmText: { ...typeScale.body },
  section: { gap: spacing.md },
  headline: { ...typeScale.sectionTitle, fontSize: 19, lineHeight: 24 },
  avatars: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  overlap: { marginLeft: -spacing.lg },
  quote: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xxs },
  quoteName: { ...typeScale.label },
  quoteText: { ...typeScale.body },
  draft: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  picks: { gap: spacing.sm },
  label: { ...typeScale.label, color: colors.textSecondary },
  pick: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pickText: { flex: 1, minWidth: 0 },
  pickName: { ...typeScale.name, fontSize: 15 },
  fine: { ...typeScale.meta, textAlign: 'center' },
});
