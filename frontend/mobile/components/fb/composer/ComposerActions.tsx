import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, hairline, layout, radius, spacing, type as typeScale } from '@/lib/theme';

export type ComposerActionId = 'photo' | 'check-in';

type ComposerAction = { id: ComposerActionId; label: string; icon: IconName; color: string };

// Facebook's "Add to your post" accents. The orange has no theme token. Only actions
// that do something are listed: Photo/video attaches a photo, Check in opens the Move composer.
const ACTIONS: readonly ComposerAction[] = [
  { id: 'photo', label: 'Photo/video', icon: 'images', color: colors.online },
  { id: 'check-in', label: 'Check in', icon: 'map-pin', color: '#F5533D' },
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
          <View style={styles.iconWell}>
            <Icon name={action.icon} size={22} color={action.color} />
          </View>
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
  list: { ...hairline('Top'), paddingVertical: spacing.xs },
  row: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  label: { ...typeScale.row, fontWeight: fontWeights.medium, flex: 1 },
  bar: {
    height: 52,
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
