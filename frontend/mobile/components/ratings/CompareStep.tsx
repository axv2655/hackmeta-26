import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { MAX_COMPARISONS } from '@/lib/ratings';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { MuseMark, RatingAnswer } from '@/lib/types';

import { MarkThumb } from './MarkThumb';

type Props = {
  mark: MuseMark;
  other: MuseMark;
  index: number;
  asking: boolean;
  onAnswer: (preferred: RatingAnswer['preferred']) => void;
};

function Choice({ mark, onPress, disabled }: { mark: MuseMark; onPress: () => void; disabled: boolean }) {
  return (
    <PressableScale
      style={styles.card}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${mark.name} was better`}
    >
      <MarkThumb mark={mark} size={88} />
      <Text style={styles.name} numberOfLines={2}>
        {mark.name}
      </Text>
      {mark.address ? (
        <Text style={styles.addr} numberOfLines={1}>
          {mark.address}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** Step 2: one pairwise question, "{this} or {other}?". */
export function CompareStep({ mark, other, index, asking, onAnswer }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.count}>
        Question {index + 1} of up to {MAX_COMPARISONS}
      </Text>
      <Text style={styles.title} accessibilityRole="header">
        {mark.name} or {other.name}?
      </Text>
      <Text style={styles.sub}>Tap the one you liked more.</Text>
      <View style={styles.row}>
        <Choice mark={mark} onPress={() => onAnswer('this')} disabled={asking} />
        <Choice mark={other} onPress={() => onAnswer('other')} disabled={asking} />
      </View>
      {asking ? (
        <ActivityIndicator color={colors.textSecondary} style={styles.spinner} />
      ) : (
        <Button title="About the same" variant="secondary" onPress={() => onAnswer('same')} style={styles.same} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  count: { ...typeScale.meta },
  title: { ...typeScale.eventTitle, textAlign: 'center' },
  sub: { ...typeScale.rowSub, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch', marginTop: spacing.lg },
  card: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  name: { ...typeScale.name, textAlign: 'center' },
  addr: { ...typeScale.meta, textAlign: 'center' },
  same: { marginTop: spacing.lg, alignSelf: 'center' },
  spinner: { marginTop: spacing.xl },
});

export default CompareStep;
