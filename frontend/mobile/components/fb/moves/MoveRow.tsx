import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReasonLine } from '@/components/common/ReasonLine';
import { BitmojiFace } from '@/components/moves/SheetParts';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { selection } from '@/lib/haptics';
import { moveMeta } from '@/lib/live';
import type { MapMove } from '@/lib/mock/moves';
import { colors } from '@/lib/theme';

import { FillChip, YoursTag, countsText, pullLabel, statusText } from './moveBits';

export type MoveRowProps = {
  move: MapMove;
  first: boolean;
  onPress: () => void;
  /** Pull up / take it back. Rows for your own Moves and ghosts have none. */
  onPull?: () => void;
};

/** One Move in the sheet list: who, what, where, Muse's reason, and Pull up. */
export function MoveRow({ move, first, onPress, onPull }: MoveRowProps) {
  const ghost = move.status === 'ghost';
  const label = onPull ? pullLabel(move) : null;
  const counts = countsText(move);
  const meta = [move.mark.name, move.distanceLabel, counts].filter(Boolean).join(' · ');
  const engaged = label === "You're going" || label === "You're there";

  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <BitmojiFace userId={move.user.id} color={moveMeta(move).color} ghost={ghost} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {move.mine ? 'Me' : move.user.firstName}
          <Text style={[styles.status, !ghost && move.status === 'there' && styles.live]}>{`  ${statusText(move)}`}</Text>
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {move.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {move.reason && !ghost ? <ReasonLine text={move.reason} style={styles.reason} /> : null}
        {(move.mine || (move.kind === 'flare' && move.fillDeadline)) && !ghost ? (
          <View style={styles.tags}>
            {move.mine ? <YoursTag /> : null}
            {move.kind === 'flare' && move.fillDeadline ? <FillChip deadline={move.fillDeadline} /> : null}
          </View>
        ) : null}
      </View>
      {label && onPull ? (
        <Button
          title={engaged ? (label === "You're there" ? 'There' : 'Going') : 'Pull up'}
          size="sm"
          variant={engaged ? 'primary' : 'tinted'}
          icon={engaged ? 'check' : undefined}
          onPress={label === "You're there" ? onPress : onPull}
          accessibilityLabel={label === "You're going" ? 'Going. Tap to take back your Pull up' : label}
        />
      ) : ghost ? (
        <Icon name="images" size={20} color={colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rowPressed: { backgroundColor: 'rgba(0,0,0,0.05)' },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 20, fontWeight: '700', color: colors.text },
  status: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  live: { color: colors.online },
  title: { fontSize: 15, lineHeight: 20, color: colors.text, marginTop: 1 },
  meta: { fontSize: 13, lineHeight: 17, color: colors.textSecondary, marginTop: 1 },
  reason: { marginTop: 3 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 4 },
});
