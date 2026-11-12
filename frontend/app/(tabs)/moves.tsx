import { StyleSheet, View } from 'react-native';

import { MovesEmptyState } from '@/components/fb/moves/MovesEmptyState';
import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { colors } from '@/lib/theme';

// PLACEHOLDER: the real Moves map replaces <MovesEmptyState /> (see ARCHITECTURE.md).
export default function MovesScreen() {
  return (
    <View style={styles.root}>
      <ScreenHeader title="Moves" />
      <MovesEmptyState onPressShare={() => {}} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
});
