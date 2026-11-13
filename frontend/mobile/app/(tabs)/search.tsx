import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { useTabBarHeight } from '@/components/fb/TabBar';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { friends, type User } from '@/lib/mock';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

const INITIAL_RECENT: User[] = friends.slice(0, 5);

export default function SearchScreen() {
  const tabBarHeight = useTabBarHeight();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<User[]>(INITIAL_RECENT);

  const q = query.trim().toLowerCase();
  const rows = q ? friends.filter((u) => u.name.toLowerCase().includes(q)) : recent;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Search" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.field}>
          <Icon name="search" size={18} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Facebook"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            accessibilityLabel="Search Facebook"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {q ? 'People' : 'Recent'}
          </Text>
        </View>

        {rows.map((user) => (
          <PressableScale
            key={user.id}
            style={styles.row}
            scaleTo={0.98}
            pressedOpacity={0.7}
            accessibilityLabel={user.name}
          >
            <Avatar source={user.avatar} size={48} />
            <Text style={styles.name} numberOfLines={1}>
              {user.name}
            </Text>
            {q ? null : (
              <IconButton
                name="close"
                size={18}
                color={colors.textSecondary}
                accessibilityLabel={`Remove ${user.name} from recent searches`}
                onPress={() => setRecent((list) => list.filter((u) => u.id !== user.id))}
              />
            )}
          </PressableScale>
        ))}

        {rows.length === 0 ? (
          <Text style={styles.empty}>{q ? `No results for "${query.trim()}"` : 'No recent searches'}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingTop: spacing.xs },
  field: {
    height: 44,
    marginHorizontal: layout.gutter,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { ...typeScale.row, flex: 1, height: 44, paddingVertical: 0 },
  sectionHeader: {
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { ...typeScale.sectionTitle, fontSize: 20, lineHeight: 25, fontWeight: '700' },
  row: {
    minHeight: 64,
    paddingLeft: layout.gutter + spacing.xs,
    paddingRight: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  name: { ...typeScale.row, flex: 1 },
  empty: {
    ...typeScale.rowSub,
    paddingHorizontal: layout.gutter + spacing.xs,
    paddingVertical: spacing.lg,
  },
});
