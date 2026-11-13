import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PersonAvatar } from '@/components/friends/PersonAvatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useProximity } from '@/lib/proximity';
import { useSession } from '@/lib/session';
import { colors, layout, radius, shadows, spacing, type as typeScale } from '@/lib/theme';
import type { ProximityPromptEvent, UserLite } from '@/lib/types';

const AVATAR = 32;
const MAX_FACES = 4;

/** The creator first, then anyone named in the prompt we can match to a known user. */
function facesFor(p: ProximityPromptEvent, users: UserLite[]): UserLite[] {
  const named = p.names
    .map((n) => users.find((u) => u.first_name === n || u.name === n))
    .filter((u): u is UserLite => !!u && u.id !== p.creator.id);
  return [p.creator, ...named].slice(0, MAX_FACES);
}

function withLine(p: ProximityPromptEvent): string {
  const names = p.names.length ? p.names : [p.creator.first_name];
  if (names.length === 1) return `You're with ${names[0]}.`;
  return `You're with ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`;
}

/**
 * Bottom card for realtime `proximity.prompt`: friends you are with just made
 * a Move. One tap adds you; nothing happens without it (1.5 rule 5).
 */
export function ProximityPrompt() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const prompt = useProximity((s) => s.prompt);
  const accept = useProximity((s) => s.accept);
  const hide = useProximity((s) => s.hide);
  const users = useSession((s) => s.users);
  const signedIn = useSession((s) => s.userId !== '');
  const faces = useMemo(() => (prompt ? facesFor(prompt, users) : []), [prompt, users]);

  if (!prompt || !signedIn) return null;

  const join = async (always: boolean) => {
    const moveId = await accept(always);
    if (moveId) router.push(`/move/${encodeURIComponent(moveId)}`);
  };

  const bottom = insets.bottom + layout.tabBarHeight + layout.tabBarGap + spacing.sm;
  return (
    <View style={[styles.layer, { bottom }]} pointerEvents="box-none">
      <Animated.View
        key={prompt.move_id}
        entering={FadeInDown.springify().damping(18)}
        exiting={FadeOutDown.duration(160)}
        style={styles.card}
        accessibilityViewIsModal={false}
      >
        <View style={styles.head}>
          <View style={styles.faces}>
            {faces.map((u, i) => (
              <View key={u.id} style={[styles.face, i > 0 && styles.faceOverlap]}>
                <PersonAvatar user={u} size={AVATAR} />
              </View>
            ))}
          </View>
          <View style={styles.nearby}>
            <Icon name="users" size={14} color={colors.textSecondary} />
            <Text style={styles.nearbyText}>Nearby</Text>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {prompt.creator.first_name} made a Move{prompt.mark_name ? ` at ${prompt.mark_name}` : ''}
        </Text>
        {prompt.text ? (
          <Text style={styles.quote} numberOfLines={2}>
            “{prompt.text}”
          </Text>
        ) : null}
        <Text style={styles.sub}>{withLine(prompt)} Add yourself?</Text>
        <View style={styles.actions}>
          <Button title="Add me" variant="primary" onPress={() => void join(false)} style={styles.grow} />
          <Button title="Not now" variant="secondary" onPress={hide} style={styles.grow} />
        </View>
        <Button
          title="Always auto-join with them"
          variant="tinted"
          size="sm"
          icon="zap"
          onPress={() => void join(true)}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, paddingHorizontal: layout.gutter, zIndex: 900 },
  card: {
    alignSelf: 'stretch',
    maxWidth: 520,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sheet,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faces: { flexDirection: 'row' },
  face: { borderRadius: AVATAR / 2, borderWidth: 2, borderColor: colors.white },
  faceOverlap: { marginLeft: -10 },
  nearby: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  nearbyText: { ...typeScale.meta },
  title: { ...typeScale.row, fontWeight: '700' },
  quote: { ...typeScale.rowSub, color: colors.text },
  sub: { ...typeScale.rowSub },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  grow: { flex: 1 },
});

export default ProximityPrompt;
