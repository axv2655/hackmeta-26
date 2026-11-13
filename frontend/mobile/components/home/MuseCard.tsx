import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { MuseBadge } from '@/components/common/MuseBadge';
import { Button } from '@/components/ui/Button';
import { SectionBand } from '@/components/ui/SectionBand';
import { minutesUntil } from '@/lib/format';
import { useSuggestions } from '@/lib/suggestions';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Suggestion, SuggestionType } from '@/lib/types';

const MAX_CARDS = 2;

function expiresLabel(iso: string): string {
  const m = minutesUntil(iso);
  if (m <= 0) return 'Expiring now';
  if (m < 60) return `Expires in ${m} min`;
  return `Expires in ${Math.round(m / 60)} h`;
}

const LABELS: Record<SuggestionType, string> = {
  flare: 'Muse · Flare idea',
  free_time: 'Muse · Free time',
  revive: 'Muse · Your crew',
  route: 'Muse',
  reel_move: 'Muse · From a Reel',
  nobody_bit: 'Muse · Try again',
};

type MuseCardProps = { suggestion: Suggestion; onSee: (s: Suggestion) => void; onDismiss: (s: Suggestion) => void };

/** One Muse proposal on Home. Muse proposes; nothing happens until the user taps See and accepts. */
export function MuseCard({ suggestion, onSee, onDismiss }: MuseCardProps) {
  const chips = suggestion.chips.slice(0, 3);
  const fill =
    suggestion.type === 'flare' && suggestion.fill_minutes ? `Fills in ${suggestion.fill_minutes} min once sent` : null;
  return (
    <View style={styles.card}>
      <MuseBadge source={suggestion.draft?.source} label={LABELS[suggestion.type]} />
      <Text style={styles.message}>{suggestion.message}</Text>
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={1}>
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.meta}>{fill ?? expiresLabel(suggestion.expires_at)}</Text>
      <View style={styles.buttons}>
        <Button title="See" onPress={() => onSee(suggestion)} style={styles.button} />
        <Button title="Not now" variant="secondary" onPress={() => onDismiss(suggestion)} style={styles.button} />
      </View>
    </View>
  );
}

/** Up to two pending Muse suggestions, newest first. Renders nothing when there are none. */
export function MuseCards() {
  const router = useRouter();
  const items = useSuggestions((s) => s.items);
  const dismiss = useSuggestions((s) => s.dismiss);
  const pending = items.filter((s) => s.status === 'pending').slice(0, MAX_CARDS);
  if (pending.length === 0) return null;

  const see = (s: Suggestion) => router.push(`/suggestion/${encodeURIComponent(s.id)}`);
  return (
    <View>
      <SectionBand />
      <View style={styles.root}>
        {pending.map((s) => (
          <MuseCard key={s.id} suggestion={s} onSee={see} onDismiss={(x) => void dismiss(x.id)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.white,
    paddingHorizontal: layout.gutter,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    backgroundColor: colors.tintBg,
  },
  message: { ...typeScale.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    maxWidth: '100%',
  },
  chipText: { ...typeScale.meta, color: colors.text },
  meta: { ...typeScale.meta },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1 },
});

export default MuseCard;
