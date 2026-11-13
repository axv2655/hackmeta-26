import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { mutualLabel, useFriends } from '@/lib/friends';
import { colors, layout, spacing } from '@/lib/theme';

import { PersonRow } from './PersonRow';

/** Real incoming friend requests at the top of Notifications, with Confirm / Delete. Rows open the profile. */
export function FriendRequestsInbox() {
  const incoming = useFriends((s) => s.incoming);
  useFocusEffect(
    useCallback(() => {
      void useFriends.getState().load();
    }, []),
  );
  if (incoming.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        Friend requests <Text style={styles.count}>{incoming.length}</Text>
      </Text>
      {incoming.map((p) => (
        <PersonRow key={p.user.id} person={p} subtitle={mutualLabel(p.mutual_count) ?? 'Wants to be friends'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, paddingHorizontal: layout.gutter + spacing.xs, paddingBottom: spacing.xs },
  count: { color: colors.badgeRed },
});
