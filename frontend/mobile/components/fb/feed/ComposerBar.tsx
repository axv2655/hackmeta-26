import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { currentUser } from '@/lib/mock';
import { colors, layout, spacing, type as typeScale } from '@/lib/theme';

export type ComposerBarProps = {
  /** Opens the composer. Defaults to pushing /post/new. */
  onPress?: () => void;
  /** Tapping your own avatar. Defaults to switching to the Profile tab. */
  onPressAvatar?: () => void;
  style?: StyleProp<ViewStyle>;
};

const AVATAR_SIZE = 42;

/** "What's on your mind?" row under the home header: avatar, prompt, photo shortcut. No action row under it. */
export function ComposerBar({ onPress, onPressAvatar, style }: ComposerBarProps) {
  const router = useRouter();
  const openComposer = onPress ?? (() => router.push('/post/new'));
  const openProfile = onPressAvatar ?? (() => router.navigate('/profile'));

  return (
    <View style={[styles.row, style]}>
      <Avatar
        source={currentUser.avatar}
        size={AVATAR_SIZE}
        onPress={openProfile}
        accessibilityLabel="Your profile"
      />
      <PressableScale
        onPress={openComposer}
        scaleTo={1}
        pressedOpacity={0.5}
        accessibilityLabel="What's on your mind? Create a post"
        style={styles.prompt}
      >
        <Text style={styles.promptText} numberOfLines={1}>
          {"What's on your mind?"}
        </Text>
      </PressableScale>
      <IconButton
        name="photo"
        size={28}
        color={colors.textSecondary}
        accessibilityLabel="Add a photo"
        onPress={openComposer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: layout.gutter,
    // The 44pt photo button carries its own inset: its glyph ends ~24pt from the edge.
    paddingRight: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
  },
  prompt: {
    flex: 1,
    height: layout.hitTarget,
    justifyContent: 'center',
    paddingLeft: spacing.md,
  },
  promptText: { ...typeScale.prompt },
});

export default ComposerBar;
