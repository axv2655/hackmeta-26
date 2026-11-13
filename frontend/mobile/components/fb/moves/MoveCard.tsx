import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { ReasonLine } from '@/components/common/ReasonLine';
import { BitmojiFace } from '@/components/moves/SheetParts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { shareMove } from '@/lib/invites';
import { moveMeta, realMoveId } from '@/lib/live';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import type { MapMove } from '@/lib/mock/moves';
import { myFirstName, useSession } from '@/lib/session';
import { colors, spacing } from '@/lib/theme';

import { FillChip, YoursTag, countsText, pullLabel, statusText } from './moveBits';
import { MoveSnapshots } from './MoveSnapshots';

export type MoveCardProps = {
  move: MapMove;
  /** The sample world is showing: no links into screens that need the backend, no Share. */
  sample: boolean;
  onPull: () => void;
  onClose: () => void;
};

const enc = encodeURIComponent;

/** The selected Move in the sheet: who, what, where, who is there, and what you can do. */
export function MoveCard({ move, sample, onPull, onClose }: MoveCardProps) {
  const router = useRouter();
  const ghost = move.status === 'ghost';
  const meta = moveMeta(move);
  const id = realMoveId(move);
  const counts = countsText(move);
  const tint = ghost ? colors.textSecondary : meta.color;

  return (
    <BottomSheetScrollView contentContainerStyle={styles.card} showsVerticalScrollIndicator={false}>
      <View style={styles.top}>
        <View style={styles.hero}>
          <Image
            source={bitmojiFor(move.user.id, move.pose)}
            style={[styles.heroImage, ghost && styles.faded]}
            contentFit="contain"
            contentPosition="bottom"
          />
        </View>
        <View style={styles.info}>
          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: ghost ? colors.surface : `${meta.color}1F` }]}>
              <Icon name={meta.icon} size={13} color={tint} />
              <Text style={[styles.chipText, { color: tint }]}>{meta.label}</Text>
            </View>
            {move.mine ? <YoursTag /> : null}
          </View>
          <Text style={styles.name}>{move.mine ? 'Me' : move.user.name}</Text>
          <Text style={[styles.status, move.status === 'there' && styles.live]}>{statusText(move)}</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close">
          <Icon name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      <Text style={styles.title}>“{move.title}”</Text>
      {move.reason && !ghost ? <ReasonLine text={move.reason} style={styles.reason} /> : null}
      {move.kind === 'flare' && move.fillDeadline && !ghost ? (
        <View style={styles.reason}>
          <FillChip deadline={move.fillDeadline} />
        </View>
      ) : null}

      <Pressable
        disabled={sample}
        onPress={() => router.push(`/mark/${enc(move.mark.id)}`)}
        style={styles.placeRow}
        accessibilityRole={sample ? undefined : 'link'}
      >
        <Icon name="map-pin" size={16} color={colors.textSecondary} />
        <Text style={styles.placeText} numberOfLines={2}>
          <Text style={sample ? undefined : styles.placeLink}>{move.mark.name}</Text>
          {[move.mark.area, move.distanceLabel].filter(Boolean).map((s) => ` · ${s}`).join('')}
        </Text>
      </Pressable>

      <People move={move} ghost={ghost} counts={counts} />

      <MoveSnapshots move={move} id={id} sample={sample} ghost={ghost} />

      <CardActions move={move} id={id} sample={sample} ghost={ghost} onPull={onPull} />
    </BottomSheetScrollView>
  );
}

function People({ move, ghost, counts }: { move: MapMove; ghost: boolean; counts: string | null }) {
  const myId = useSession((s) => s.userId);
  if (move.joined.length === 0) return null;
  const names = move.joined.map((u) => (u.id === myId ? 'Me' : u.firstName));
  return (
    <View style={styles.joinedRow}>
      <View style={styles.faces}>
        {move.joined.slice(0, 5).map((u, i) => (
          <View key={u.id} style={[styles.faceWrap, i > 0 && styles.faceOverlap]}>
            <BitmojiFace userId={u.id} size={32} ghost={ghost} />
          </View>
        ))}
      </View>
      <View style={styles.flex}>
        <Text style={styles.joinedText} numberOfLines={2}>
          {ghost ? `${names.join(', ')} went too` : names.join(', ')}
        </Text>
        {!ghost && counts ? <Text style={styles.counts}>{counts}</Text> : null}
      </View>
    </View>
  );
}

type ActionsProps = { move: MapMove; id: string; sample: boolean; ghost: boolean; onPull: () => void };

function CardActions({ move, id, sample, ghost, onPull }: ActionsProps) {
  const router = useRouter();
  const label = pullLabel(move);
  const share = () =>
    void shareMove({
      moveId: id,
      markName: move.mark.name,
      creatorFirst: move.user.firstName,
      inviterFirst: myFirstName('A friend'),
    });

  if (ghost) {
    if (sample) return null;
    return (
      <View style={[styles.actions, styles.actionsTop]}>
        <Button
          title="See Moments"
          icon="images"
          variant="primary"
          style={styles.flex}
          onPress={() => router.push(`/move/${enc(id)}/moments`)}
        />
        <Button title="Details" variant="secondary" style={styles.flex} onPress={() => router.push(`/move/${enc(id)}`)} />
      </View>
    );
  }

  return (
    <View style={styles.actionsCol}>
      {move.mine ? (
        sample ? null : (
          <Button title="Manage" icon="settings" variant="primary" fullWidth onPress={() => router.push(`/move/${enc(id)}`)} />
        )
      ) : label ? (
        <Button
          title={label}
          icon={label === 'Pull up' ? 'navigation' : 'check'}
          variant={label === 'Pull up' ? 'primary' : 'tinted'}
          fullWidth
          onPress={label === "You're there" ? () => router.push(`/move/${enc(id)}`) : onPull}
          accessibilityLabel={label === "You're going" ? "You're going. Tap to take back your Pull up" : label}
        />
      ) : null}
      {label === "You're going" ? <Text style={styles.hint}>Tap again to take it back</Text> : null}
      {sample ? null : (
        <View style={styles.actions}>
          {move.mine ? null : (
            <Button title="Details" variant="secondary" style={styles.flex} onPress={() => router.push(`/move/${enc(id)}`)} />
          )}
          <Button title="Share" icon="share-external" variant="secondary" style={styles.flex} onPress={share} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  hero: { width: 112, height: 112 },
  heroImage: { width: '100%', height: '100%' },
  faded: { opacity: 0.45 },
  info: { flex: 1, paddingBottom: spacing.sm, gap: 4 },
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  name: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  status: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  live: { color: colors.online },
  close: {
    position: 'absolute',
    top: 4,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(118,118,128,0.16)',
  },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  reason: { marginTop: spacing.sm },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  placeText: { flex: 1, fontSize: 15, color: colors.textSecondary },
  placeLink: { color: colors.text, fontWeight: '600' },
  joinedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: spacing.md },
  faces: { flexDirection: 'row' },
  faceWrap: { borderRadius: 18, borderWidth: 2, borderColor: colors.white },
  faceOverlap: { marginLeft: -12 },
  joinedText: { fontSize: 15, color: colors.text },
  counts: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  actionsCol: { gap: 10, marginTop: spacing.lg },
  actions: { flexDirection: 'row', gap: 10 },
  actionsTop: { marginTop: spacing.lg },
  hint: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: -4 },
  flex: { flex: 1 },
});
