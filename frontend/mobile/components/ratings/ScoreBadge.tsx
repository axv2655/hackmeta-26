import { StyleSheet, Text, View } from 'react-native';

import { scoreText } from '@/lib/ratings';
import { colors, radius } from '@/lib/theme';

/** Face band colors: Loved 7-10 green, Fine 4-6.9 amber, Not for us 0-3.9 gray. */
function bandColor(score: number): string {
  if (score >= 7) return '#1F9D55';
  if (score >= 4) return '#D98A00';
  return colors.textSecondary;
}

/** Rounded 0-10 score capsule. */
export function ScoreBadge({ score, large = false }: { score: number; large?: boolean }) {
  return (
    <View
      style={[styles.badge, large && styles.large, { backgroundColor: bandColor(score) }]}
      accessible
      accessibilityLabel={`Score ${scoreText(score)} out of 10`}
    >
      <Text style={[styles.text, large && styles.largeText]}>{scoreText(score)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 40,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minWidth: 72, height: 44, paddingHorizontal: 14 },
  text: { color: colors.white, fontSize: 14, fontWeight: '700' },
  largeText: { fontSize: 22 },
});

export default ScoreBadge;
