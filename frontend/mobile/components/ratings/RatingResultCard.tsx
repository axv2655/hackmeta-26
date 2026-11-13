import { StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { ReasonLine } from '@/components/common/ReasonLine';
import { Button } from '@/components/ui/Button';
import { categoryMeta } from '@/lib/categories';
import { parseIso, serverNow } from '@/lib/format';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { RatingResult, Taste } from '@/lib/types';

import { MarkThumb } from './MarkThumb';
import { ScoreBadge } from './ScoreBadge';

const TOP_ROWS = 5;
const FRESH_MS = 5 * 60_000;

/** Only claim "updated" when the taste profile changed in the last few minutes. */
function freshTaste(taste: Taste): boolean {
  const t = parseIso(taste.updated_at);
  return Number.isFinite(t) && serverNow() - t < FRESH_MS;
}

type Props = {
  result: RatingResult;
  taste: Taste | null;
  onLeaderboard: () => void;
  onDone: () => void;
};

function TasteLine({ taste }: { taste: Taste | null }) {
  if (!taste?.summary) {
    return (
      <View style={styles.taste}>
        <ReasonLine text="Muse is still learning your taste" />
        <Text style={styles.tasteText}>Rank a few more spots and it will start picking up what you like.</Text>
      </View>
    );
  }
  return (
    <View style={styles.taste}>
      <MuseBadge label={freshTaste(taste) ? 'Muse updated your taste' : 'Your taste, by Muse'} />
      <Text style={styles.tasteText}>{taste.summary}</Text>
    </View>
  );
}

/** Where the Mark landed, your top of the list, and Muse's updated taste line. */
export function RatingResultCard({ result, taste, onLeaderboard, onDone }: Props) {
  const label = categoryMeta(result.category).label.toLowerCase();
  const top = result.list.slice(0, TOP_ROWS);
  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <MarkThumb mark={result.mark} size={72} />
        <Text style={styles.title} accessibilityRole="header">
          #{result.position} of {result.total} in {label}
        </Text>
        <Text style={styles.sub}>{result.mark.name}</Text>
        <ScoreBadge score={result.score} large />
      </View>

      {top.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.section}>Your top {label} spots</Text>
          {top.map((row) => {
            const mine = row.mark.id === result.mark.id;
            return (
              <View key={row.mark.id} style={[styles.row, mine && styles.rowMine]}>
                <Text style={styles.pos}>{row.position}</Text>
                <Text style={[styles.name, mine && styles.nameMine]} numberOfLines={1}>
                  {row.mark.name}
                </Text>
                <ScoreBadge score={row.score} />
              </View>
            );
          })}
        </View>
      ) : null}

      <TasteLine taste={taste} />

      <View style={styles.actions}>
        <Button title="See leaderboard" variant="tinted" size="lg" fullWidth onPress={onLeaderboard} />
        <Button title="Done" size="lg" fullWidth onPress={onDone} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm },
  title: { ...typeScale.eventTitle, textAlign: 'center' },
  sub: { ...typeScale.rowSub, textAlign: 'center' },
  list: { gap: spacing.xs },
  section: { ...typeScale.sectionTitle, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowMine: { backgroundColor: colors.chipSelectedBg },
  pos: { ...typeScale.label, width: 20, color: colors.textSecondary },
  name: { ...typeScale.body, flex: 1 },
  nameMine: { fontWeight: '600', color: colors.chipSelectedText },
  taste: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  tasteText: { ...typeScale.body },
  actions: { gap: spacing.sm },
});

export default RatingResultCard;
