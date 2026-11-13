import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { RatingFace, RatingQuestions } from '@/lib/types';

import { MarkThumb } from './MarkThumb';

const GLYPH: Record<RatingFace, string> = { loved: '😍', fine: '🙂', not_for_us: '😕' };
const FALLBACK: { key: RatingFace; label: string }[] = [
  { key: 'loved', label: 'Loved it' },
  { key: 'fine', label: 'Fine' },
  { key: 'not_for_us', label: 'Not for us' },
];

/** Step 1: "How was {mark}?" with three big faces. */
export function FaceStep({ questions, onPick }: { questions: RatingQuestions; onPick: (f: RatingFace) => void }) {
  const faces = questions.faces.length ? questions.faces : FALLBACK;
  return (
    <View style={styles.wrap}>
      <MarkThumb mark={questions.mark} size={72} />
      <Text style={styles.title} accessibilityRole="header">
        How was {questions.mark.name}?
      </Text>
      <Text style={styles.sub}>Pick one. It sets where it lands on your list.</Text>
      <View style={styles.row}>
        {faces.map((f) => (
          <PressableScale
            key={f.key}
            style={styles.face}
            onPress={() => onPick(f.key)}
            accessibilityRole="button"
            accessibilityLabel={f.label}
          >
            <Text style={styles.glyph}>{GLYPH[f.key]}</Text>
            <Text style={styles.label}>{f.label}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.md },
  title: { ...typeScale.eventTitle, textAlign: 'center' },
  sub: { ...typeScale.rowSub, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, alignSelf: 'stretch' },
  face: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  glyph: { fontSize: 44, lineHeight: 52 },
  label: { ...typeScale.label, fontSize: 15 },
});

export default FaceStep;
