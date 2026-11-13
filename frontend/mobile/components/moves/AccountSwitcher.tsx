import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { useLive } from '@/lib/live';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import { useSession } from '@/lib/session';
import { useInbox } from '@/lib/store/inbox';
import { useMyMoves } from '@/lib/store/moves';
import { colors, spacing } from '@/lib/theme';

/**
 * Demo login (ARCHITECTURE.md 6, "Continue with Facebook" picker): pick which
 * seeded person this phone is. Two phones as two friends show a Move posted on
 * one arriving on the other. Hidden when the backend is unreachable.
 */
export function AccountSwitcher() {
  const users = useSession((s) => s.users);
  const userId = useSession((s) => s.userId);
  if (users.length === 0) return null;

  const pick = (id: string) => {
    if (id === userId) return;
    selection();
    useSession.getState().setUser(id);
    useMyMoves.setState({ mine: [], focusId: null });
    useInbox.setState({ items: [], banner: null });
    void useLive.getState().load();
    void useInbox.getState().load();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Use Moves as</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {users.map((u) => {
          const on = u.id === userId;
          return (
            <PressableScale
              key={u.id}
              onPress={() => pick(u.id)}
              scaleTo={0.92}
              style={styles.person}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Use Moves as ${u.first_name}`}
            >
              <View style={[styles.face, on && styles.faceOn]}>
                <Image source={bitmojiFor(u.id, 'selfie')} style={styles.image} contentFit="cover" />
              </View>
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {u.first_name}
              </Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: spacing.sm },
  title: { fontSize: 15, fontWeight: '600', color: colors.textSecondary, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  row: { gap: spacing.md, paddingHorizontal: spacing.md },
  person: { alignItems: 'center', width: 58, gap: 4 },
  face: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.transparent, overflow: 'hidden', backgroundColor: '#EEF3FF' },
  faceOn: { borderColor: colors.blue },
  image: { width: '100%', height: '100%' },
  name: { fontSize: 12, color: colors.textSecondary },
  nameOn: { color: colors.blue, fontWeight: '700' },
});
