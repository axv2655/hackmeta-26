import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/common/EmptyState';
import { spacing } from '@/lib/theme';

import { sectionStyles } from './sectionStyles';

/** The Posts section for a real account: nothing posted on the profile yet. */
export function ProfileNoPosts({ onPressMakeMove }: { onPressMakeMove: () => void }) {
  return (
    <View style={sectionStyles.section}>
      <Text style={sectionStyles.heading} accessibilityRole="header">
        Posts
      </Text>
      <EmptyState
        icon="moves-filled"
        title="No posts yet"
        body="Share what you're already doing as a Move and friends can pull up."
        action={{ label: 'Make a Move', onPress: onPressMakeMove }}
        style={styles.state}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 0, paddingVertical: spacing.xl },
});
