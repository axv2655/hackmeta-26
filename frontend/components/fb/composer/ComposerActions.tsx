import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, hairline, layout, spacing, type as typeScale } from '@/lib/theme';

export type ComposerActionId = 'photo' | 'tag' | 'feeling' | 'check-in' | 'live';

type ComposerAction = { id: ComposerActionId; label: string; icon: IconName; color: string };

// Facebook's "Add to your post" accents. The yellow and orange have no theme token.
const ACTIONS: readonly ComposerAction[] = [
  { id: 'photo', label: 'Photo/video', icon: 'images', color: colors.online },
  { id: 'tag', label: 'Tag people', icon: 'tag', color: colors.blue },
  { id: 'feeling', label: 'Feeling/activity', icon: 'smile', color: '#F7B928' },
  { id: 'check-in', label: 'Check in', icon: 'map-pin', color: '#F5533D' },
  { id: 'live', label: 'Live video', icon: 'video', color: colors.badgeRed },
];

export type ComposerActionsProps = {
  /**
   * 'list' = one labeled row per action (keyboard closed).
   * 'bar'  = a single row of icons that fits above the keyboard.
   */
  variant: 'list' | 'bar';
  onAction: (id: ComposerActionId) => void;
  /** Highlights the photo action while a photo is attached. */
  photoAttached?: boolean;
};

/** "Add to your post" actions under the composer. */
export function ComposerActions({ variant, onAction, photoAttached = false }: ComposerActionsProps) {
  if (variant === 'bar') {
    return (
      <View style={styles.bar}>
        {ACTIONS.map((action) => (
          <PressableScale
            key={action.id}
            onPress={() => onAction(action.id)}
            scaleTo={0.9}
            style={styles.barItem}
            accessibilityLabel={action.label}
          >
            <Icon name={action.icon} size={24} color={action.color} />
          </PressableScale>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {ACTIONS.map((action) => (
        <PressableScale
          key={action.id}
          onPress={() => onAction(action.id)}
          scaleTo={1}
          pressedOpacity={0.5}
          style={styles.row}
          accessibilityLabel={action.label}
        >
          <Icon name={action.icon} size={24} color={action.color} />
          <Text style={styles.label} numberOfLines={1}>
            {action.label}
          </Text>
          {action.id === 'photo' && photoAttached ? <Icon name="check" size={20} color={colors.blue} /> : null}
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { ...hairline('Top') },
  row: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  label: { ...typeScale.body, flex: 1 },
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    ...hairline('Top'),
  },
  barItem: {
    flex: 1,
    height: layout.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ComposerActions;
