import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, type Href } from 'expo-router';

import { Icon, type IconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { SectionBand } from '@/components/ui/SectionBand';
import { useFriends } from '@/lib/friends';
import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';

export const FIRST_RUN_KEY = 'moves-first-run-done';

type Step = { icon: IconName; title: string; body: string; href: Href };

const STEPS: readonly Step[] = [
  { icon: 'user-plus', title: 'Find friends', body: 'Moves only go to people you add.', href: '/friends' },
  { icon: 'users', title: 'Make a Circle', body: 'Pick who sees a Move in one tap.', href: '/circles/new' },
  { icon: 'map-pin', title: 'Turn on location', body: 'Optional. Finds places near you.', href: '/settings/privacy' },
];

async function readDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(FIRST_RUN_KEY)) === '1';
  } catch {
    return false;
  }
}

async function writeDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_RUN_KEY, '1');
  } catch {
    // Storage unavailable: the card hides for this session only.
  }
}

/**
 * Getting started on Home. Shown while the user has no friends, or until they
 * dismiss it once. Every step opens a real screen.
 */
export function FirstRunCard() {
  const router = useRouter();
  const friendsLoaded = useFriends((s) => s.loaded);
  const friendCount = useFriends((s) => s.friends.length);
  const loadFriends = useFriends((s) => s.load);
  const [done, setDone] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void readDone().then((v) => alive && setDone(v));
    if (!useFriends.getState().loaded) void loadFriends();
    return () => {
      alive = false;
    };
  }, [loadFriends]);

  if (done === null || !friendsLoaded) return null;
  if (done && friendCount > 0) return null;

  const dismiss = () => {
    setDone(true);
    void writeDone();
  };
  // Dismissed but still no friends: keep only the card's first step visible as a nudge.
  const steps = done ? STEPS.slice(0, 1) : STEPS;

  return (
    <View>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {done ? 'Add friends to see their Moves' : 'Get started with Moves'}
          </Text>
          {done ? null : (
            <IconButton
              name="close"
              size={22}
              color={colors.textSecondary}
              hitSize={40}
              accessibilityLabel="Dismiss getting started"
              onPress={dismiss}
            />
          )}
        </View>
        {steps.map((step) => (
          <PressableScale
            key={step.title}
            onPress={() => router.push(step.href)}
            scaleTo={1}
            pressedOpacity={0.6}
            style={styles.step}
            accessibilityRole="button"
            accessibilityLabel={step.title}
          >
            <View style={styles.stepIcon}>
              <Icon name={step.icon} size={20} color={colors.blue} />
            </View>
            <View style={styles.stepText}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepBody}>{step.body}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textSecondary} />
          </PressableScale>
        ))}
      </View>
      <SectionBand />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, paddingHorizontal: layout.gutter, paddingBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  title: { ...typeScale.sectionTitle, fontWeight: fontWeights.bold, letterSpacing: -0.3, flex: 1 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tintBg,
  },
  stepText: { flex: 1, minWidth: 0 },
  stepTitle: { ...typeScale.name, fontSize: 15, lineHeight: 19 },
  stepBody: { ...typeScale.meta },
});

export default FirstRunCard;
