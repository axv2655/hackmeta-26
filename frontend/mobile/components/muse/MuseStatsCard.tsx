import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { DemoMuseStats } from '@/lib/types';

import { preview } from './demoActions';

export type MuseStatsCardProps = {
  stats: DemoMuseStats | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

type LastOutput = { agent?: unknown; used_fallback?: unknown; latency_ms?: unknown; output?: unknown };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OutputRow({ row }: { row: LastOutput }) {
  const fallback = Boolean(row.used_fallback);
  const ms = typeof row.latency_ms === 'number' ? ` · ${Math.round(row.latency_ms)} ms` : '';
  return (
    <View style={styles.output}>
      <Text style={styles.outputHead}>
        {String(row.agent ?? 'agent')} · {fallback ? 'heuristic' : 'Muse'}
        {ms}
      </Text>
      <Text style={styles.outputBody} numberOfLines={3}>
        {preview(row.output) || 'No output'}
      </Text>
    </View>
  );
}

/** What Muse has done this session: client, calls, fallbacks and its last three outputs. */
export function MuseStatsCard({ stats, loading, error, onRefresh }: MuseStatsCardProps) {
  const last = (stats?.last_outputs ?? []).slice(0, 3) as LastOutput[];
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Muse stats</Text>
        {loading ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          <Pressable onPress={onRefresh} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Refresh</Text>
          </Pressable>
        )}
      </View>
      {error && !stats ? <Text style={styles.empty}>{error}</Text> : null}
      {stats ? (
        <>
          <View style={styles.stats}>
            <Stat label="client" value={stats.client === 'http' ? 'Live' : 'Fake'} />
            <Stat label="calls" value={String(stats.calls)} />
            <Stat label="fallbacks" value={String(stats.fallbacks)} />
            <Stat label="fallback rate" value={`${Math.round(stats.fallback_rate * 100)}%`} />
          </View>
          {last.length ? (
            last.map((row, i) => <OutputRow key={i} row={row} />)
          ) : (
            <Text style={styles.empty}>No Muse calls yet. Fire a scan above.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typeScale.name },
  link: { ...typeScale.button, color: colors.blue },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { ...typeScale.name },
  statLabel: { ...typeScale.meta },
  output: { backgroundColor: colors.white, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  outputHead: { ...typeScale.label },
  outputBody: { ...typeScale.meta },
  empty: { ...typeScale.meta },
});

export default MuseStatsCard;
