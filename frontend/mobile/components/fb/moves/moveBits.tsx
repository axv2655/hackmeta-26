import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { untilLabel } from '@/lib/format';
import { moveCounts } from '@/lib/live';
import type { MapMove } from '@/lib/mock/moves';
import { colors } from '@/lib/theme';

/** Re-render every `ms` (fill countdowns tick every 30 s). */
export function useTick(ms = 30000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return tick;
}

export function statusText(m: MapMove): string {
  if (m.status === 'omw') return `On the way · ${m.timeLabel}`;
  if (m.status === 'ghost') return `Was there · ${m.timeLabel} ago`;
  return `There · ${m.timeLabel}`;
}

/** "2 there · 1 on the way" from the participants, or null when nobody is on it yet. */
export function countsText(m: MapMove): string | null {
  if (!m.participants) return null;
  const { there, onTheWay } = moveCounts(m);
  const parts = [there > 0 ? `${there} there` : null, onTheWay > 0 ? `${onTheWay} on the way` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** A Flare's countdown chip: "fills in 7 min". Re-renders every 30 s. */
export function FillChip({ deadline }: { deadline: string }) {
  useTick(30000);
  const label = untilLabel(deadline);
  const closed = label === 'fill window closed';
  return (
    <View style={[styles.chip, closed ? styles.chipClosed : styles.chipOpen]}>
      <Icon name="flame" size={12} color={closed ? colors.textSecondary : '#E8590C'} />
      <Text style={[styles.chipText, { color: closed ? colors.textSecondary : '#E8590C' }]}>{label}</Text>
    </View>
  );
}

export function YoursTag() {
  return (
    <View style={[styles.chip, styles.yours]}>
      <Text style={[styles.chipText, { color: colors.chipSelectedText }]}>Yours</Text>
    </View>
  );
}

/** The label for the Pull up button, or null when it should not show. */
export function pullLabel(m: MapMove): string | null {
  if (m.mine || m.status === 'ghost' || m.myStatus === 'left') return null;
  if (m.myStatus === 'there') return "You're there";
  if (m.myStatus === 'going' || m.going) return "You're going";
  return 'Pull up';
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  chipOpen: { backgroundColor: '#FFF0E6' },
  chipClosed: { backgroundColor: colors.surface },
  yours: { backgroundColor: colors.chipSelectedBg },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
