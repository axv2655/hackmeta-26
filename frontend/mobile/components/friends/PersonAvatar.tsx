import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { users as mockUsers } from '@/lib/mock';
import type { UserLite } from '@/lib/session';
import { colors } from '@/lib/theme';

/** The demo cast's photo when we have one, else initials on their color. */
export function PersonAvatar({ user, size = 48 }: { user: UserLite; size?: number }) {
  const mock = mockUsers.find((m) => m.id === user.id.replace(/_/g, '-'));
  if (mock) return <Avatar source={mock.avatar} size={size} />;
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: user.avatar_color || colors.blue }]}
      accessibilityElementsHidden
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.white, fontWeight: '700' },
});
