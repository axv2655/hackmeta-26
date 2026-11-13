import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';

/** Weekly hangouts as small bars, oldest on the left. Gray when the crew is fading. */
export function Sparkline({ history, fading, height = 28 }: { history: number[]; fading: boolean; height?: number }) {
  const peak = Math.max(1, ...history);
  const total = history.reduce((a, b) => a + b, 0);
  const color = fading ? colors.placeholder : colors.blue;
  return (
    <View
      style={[styles.row, { height }]}
      accessible
      accessibilityLabel={`${total} ${total === 1 ? 'hangout' : 'hangouts'} in the last ${history.length} weeks`}
    >
      {history.map((n, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: n === 0 ? 2 : Math.max(4, (n / peak) * height), backgroundColor: n === 0 ? colors.hairline : color },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 6, borderRadius: 2 },
});
