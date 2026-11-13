import { StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { moveMeta } from '@/lib/live';
import type { MapMove } from '@/lib/mock/moves';
import { colors, spacing } from '@/lib/theme';

import { BitmojiFace } from './SheetParts';

export type ForYouStripProps = {
  /** Moves in Muse's ranking order (the order `/moves/nearby` returned). */
  moves: MapMove[];
  onSelect: (id: string) => void;
};

/** The top 3 friends' Moves Muse ranked for you, each with Muse's reason. */
export function forYouPicks(moves: MapMove[]): MapMove[] {
  return moves.filter((m) => m.status !== 'ghost' && !m.mine && m.reason).slice(0, 3);
}

/** "For you": Muse's top picks with the reason it ranked each one. Hidden when Muse gave no reasons. */
export function ForYouStrip({ moves, onSelect }: ForYouStripProps) {
  const picks = forYouPicks(moves);
  if (picks.length === 0) return null;
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.title}>For you</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {picks.map((m) => (
          <PressableScale
            key={m.id}
            onPress={() => {
              selection();
              onSelect(m.id);
            }}
            style={styles.card}
            scaleTo={0.97}
            accessibilityLabel={`${m.user.firstName}: ${m.title}. ${m.reason ?? ''}`}
          >
            <View style={styles.top}>
              <BitmojiFace userId={m.user.id} size={40} color={moveMeta(m).color} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.user.firstName}
                </Text>
                <Text style={styles.place} numberOfLines={1}>
                  {m.mark.name}
                </Text>
              </View>
            </View>
            <Text style={styles.text} numberOfLines={2}>
              {m.title}
            </Text>
            <ReasonLine text={m.reason ?? ''} />
            <MuseBadge label="Ranked by Muse" />
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '700', color: colors.text },
  row: { gap: 10, paddingHorizontal: spacing.xs, paddingBottom: spacing.xs },
  card: {
    width: 236,
    padding: 12,
    gap: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, lineHeight: 19, fontWeight: '700', color: colors.text },
  place: { fontSize: 13, lineHeight: 17, color: colors.textSecondary },
  text: { fontSize: 15, lineHeight: 20, color: colors.text, minHeight: 40 },
});
