import { StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { Button } from '@/components/ui/Button';
import { lastTogether, patternSummary } from '@/lib/crews';
import type { PseudoGroup } from '@/lib/types';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

import { AvatarStack } from './AvatarStack';
import { Sparkline } from './Sparkline';

type Props = {
  crew: PseudoGroup;
  reviving: boolean;
  busy: boolean;
  onRevive: () => void;
  onNotify: () => void;
  onToggleMute: () => void;
};

function names(crew: PseudoGroup): string {
  const firsts = crew.members.map((m) => m.first_name);
  if (firsts.length <= 3) return `You, ${firsts.join(', ')}`;
  return `You, ${firsts.slice(0, 2).join(', ')} and ${firsts.length - 2} more`;
}

/** One inferred crew: who, how often lately, what Muse noticed, and what you can do. */
export function CrewCard({ crew, reviving, busy, onRevive, onNotify, onToggleMute }: Props) {
  const last = lastTogether(crew);
  return (
    <View style={[styles.card, crew.muted && styles.muted]}>
      <View style={styles.head}>
        <Text style={styles.label} numberOfLines={1}>
          {crew.label}
        </Text>
        {crew.fading && !crew.muted ? (
          <View style={styles.fading}>
            <Text style={styles.fadingText}>Fading</Text>
          </View>
        ) : null}
        {crew.muted ? (
          <View style={styles.mutedPill}>
            <Text style={styles.mutedText}>Muted</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.people}>
        <AvatarStack users={crew.members} />
        <Text style={styles.names} numberOfLines={1}>
          {names(crew)}
        </Text>
      </View>
      <View style={styles.trend}>
        <Sparkline history={crew.history} fading={crew.fading} />
        <Text style={styles.meta}>{last ?? 'Last 12 weeks'}</Text>
      </View>
      <View style={styles.reason}>
        <MuseBadge />
        <ReasonLine text={`Muse noticed you ${patternSummary(crew)}`} style={styles.reasonLine} />
      </View>
      <View style={styles.actions}>
        <Button
          title={reviving ? 'Asking Muse...' : 'Revive'}
          icon="sparkles"
          size="sm"
          onPress={onRevive}
          disabled={busy}
          style={styles.flex}
        />
        <Button title="Notify this crew" icon="send" size="sm" variant="secondary" onPress={onNotify} style={styles.flex} />
      </View>
      <Button
        title={crew.muted ? 'Unmute' : "Don't suggest again"}
        icon={crew.muted ? 'bell' : 'bell-off'}
        size="sm"
        variant="tinted"
        onPress={onToggleMute}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  muted: { opacity: 0.75 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typeScale.name, flexShrink: 1, textTransform: 'capitalize' },
  fading: { backgroundColor: '#FFF1E0', borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  fadingText: { ...typeScale.label, fontSize: 12, color: '#B35C00' },
  mutedPill: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  mutedText: { ...typeScale.label, fontSize: 12, color: colors.textSecondary },
  people: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  names: { ...typeScale.rowSub, flexShrink: 1 },
  trend: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  meta: { ...typeScale.meta },
  reason: { gap: spacing.xs },
  reasonLine: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
