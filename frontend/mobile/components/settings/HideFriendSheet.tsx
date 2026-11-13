import { useEffect } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { Icon } from '@/components/ui/Icon';
import { useSettingsFriends } from '@/lib/settings';
import { colors, hairline, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Friend, UserLite } from '@/lib/types';

export type HideFriendSheetProps = {
  visible: boolean;
  /** Ids already hidden; they are left out of the list. */
  hiddenIds: Set<string>;
  onPick: (user: UserLite) => void;
  onClose: () => void;
};

/** Pick a friend to hide your Moves from. */
export function HideFriendSheet({ visible, hiddenIds, onPick, onClose }: HideFriendSheetProps) {
  const insets = useSafeAreaInsets();
  const { friends, status, error, load } = useSettingsFriends();

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const rows = friends.filter((f) => !hiddenIds.has(f.user.id));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.page, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Hide from someone
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
            <Icon name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.sub}>They won&apos;t see your Moves or your ghost. They aren&apos;t told.</Text>
        <Body status={status} error={error} rows={rows} onRetry={load} onPick={onPick} />
      </View>
    </Modal>
  );
}

type BodyProps = {
  status: string;
  error: string | null;
  rows: Friend[];
  onRetry: () => void;
  onPick: (user: UserLite) => void;
};

function Body({ status, error, rows, onRetry, onPick }: BodyProps) {
  if (status === 'idle' || status === 'loading') return <LoadingState label="Loading friends" rows={5} />;
  if (status === 'error') return <ErrorState message={error ?? 'Could not load friends'} onRetry={onRetry} />;
  if (rows.length === 0) {
    return <EmptyState icon="users" title="No friends to hide from" body="Friends you add show up here." />;
  }
  return (
    <FlatList
      data={rows}
      keyExtractor={(f) => f.user.id}
      renderItem={({ item, index }) => (
        <Pressable
          onPress={() => onPick(item.user)}
          accessibilityRole="button"
          accessibilityLabel={`Hide from ${item.user.name}`}
          style={({ pressed }) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}
        >
          <PersonAvatar user={item.user} size={44} />
          <Text style={styles.name} numberOfLines={1}>
            {item.user.name}
          </Text>
          <Icon name="eye-off" size={18} color={colors.textSecondary} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: { ...typeScale.screenTitle },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.grayButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sub: { ...typeScale.rowSub, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { ...hairline('Top') },
  pressed: { backgroundColor: colors.surface },
  name: { ...typeScale.name, flex: 1 },
});
