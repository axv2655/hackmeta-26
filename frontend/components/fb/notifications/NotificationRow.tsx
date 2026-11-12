import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cubicBezier, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { IconBadge } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Notification, TextSegment } from '@/lib/mock';
import { colors, fontWeights, layout, motion, spacing, type as typeScale } from '@/lib/theme';

import type { RequestResolution } from './types';

const AVATAR_SIZE = layout.avatarLarge;
const BADGE_SIZE = 26;
const BADGE_RING = 2;

// The unread tint is a two-state color flip, so it is a CSS transition rather than a worklet:
// the row background and the ring around the type badge fade together.
const TINT_TRANSITION = {
  transitionProperty: 'backgroundColor',
  transitionDuration: motion.slow,
  transitionTimingFunction: cubicBezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]),
} as const;

/** Text shown once an inline friend request has been answered. */
export function resolvedSegments(notification: Notification, resolution: RequestResolution): TextSegment[] {
  const name = notification.actor?.name ?? 'this person';
  return resolution === 'confirmed'
    ? [{ text: 'You and ' }, { text: name, bold: true }, { text: ' are now friends.' }]
    : [{ text: 'You removed the friend request from ' }, { text: name, bold: true }, { text: '.' }];
}

/** The segments a row is currently showing (the seeded text, or the resolved friend-request text). */
export function segmentsFor(notification: Notification, resolution?: RequestResolution): TextSegment[] {
  return resolution ? resolvedSegments(notification, resolution) : notification.segments;
}

export type NotificationRowProps = {
  notification: Notification;
  unread: boolean;
  /** Set once the inline Confirm / Delete buttons have been used. */
  resolution?: RequestResolution;
  onPress: (id: string) => void;
  onPressMore: (id: string) => void;
  onConfirm: (id: string) => void;
  onDelete: (id: string) => void;
};

/** Fades its children in once on mount: used when a friend request resolves in place. */
function FadeIn({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withTiming(1, { duration: motion.slow }));
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function NotificationRowBase({
  notification,
  unread,
  resolution,
  onPress,
  onPressMore,
  onConfirm,
  onDelete,
}: NotificationRowProps) {
  const { id } = notification;
  const segments = segmentsFor(notification, resolution);
  const showActions = notification.hasActions && resolution == null;
  const tint = { backgroundColor: unread ? colors.unread : colors.white };

  const plainText = segments.map((segment) => segment.text).join('');
  const label = `${unread ? 'Unread. ' : ''}${plainText} ${notification.timeLabel} ago`;

  const copy = (
    <>
      <Text style={styles.text} numberOfLines={3}>
        {segments.map((segment, index) => (
          <Text key={index} style={segment.bold ? styles.bold : undefined}>
            {segment.text}
          </Text>
        ))}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        <Text style={unread ? styles.timeUnread : undefined}>{notification.timeLabel}</Text>
        {showActions && notification.detail ? ` · ${notification.detail}` : null}
      </Text>
    </>
  );

  return (
    <Animated.View style={[tint, TINT_TRANSITION]}>
      <PressableScale
        onPress={() => onPress(id)}
        scaleTo={1}
        pressedOpacity={0.6}
        accessibilityLabel={label}
        style={styles.row}
      >
        <Avatar
          source={notification.avatar}
          size={AVATAR_SIZE}
          badge={
            <Animated.View style={[styles.badgeRing, tint, TINT_TRANSITION]}>
              <IconBadge name={notification.badgeIcon} color={notification.badgeColor} size={BADGE_SIZE} />
            </Animated.View>
          }
        />

        <View style={styles.body}>
          {resolution ? <FadeIn key={resolution}>{copy}</FadeIn> : copy}
          {showActions ? (
            <View style={styles.actions}>
              <Button
                title="Confirm"
                onPress={() => onConfirm(id)}
                accessibilityLabel={`Confirm friend request from ${notification.actor?.name ?? 'this person'}`}
                style={styles.actionButton}
              />
              <Button
                title="Delete"
                variant="secondary"
                onPress={() => onDelete(id)}
                accessibilityLabel={`Delete friend request from ${notification.actor?.name ?? 'this person'}`}
                style={styles.actionButton}
              />
            </View>
          ) : null}
        </View>

        <IconButton
          name="more"
          size={20}
          color={colors.textSecondary}
          accessibilityLabel="Manage this notification"
          onPress={() => onPressMore(id)}
          style={styles.more}
        />
      </PressableScale>
    </Animated.View>
  );
}

/** One notification: 60pt avatar with a type badge, rich text, time, and a "..." button. */
export const NotificationRow = memo(NotificationRowBase);

const ROW_PADDING_V = spacing.sm;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: layout.gutter,
    paddingRight: spacing.xs,
    paddingVertical: ROW_PADDING_V,
    minHeight: AVATAR_SIZE + ROW_PADDING_V * 2,
  },
  badgeRing: {
    padding: BADGE_RING,
    borderRadius: (BADGE_SIZE + BADGE_RING * 2) / 2,
  },
  body: {
    flex: 1,
    minHeight: AVATAR_SIZE,
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  text: { fontSize: 15, lineHeight: 20, fontWeight: fontWeights.regular, color: colors.text },
  bold: { fontWeight: fontWeights.semibold },
  meta: { ...typeScale.meta, marginTop: spacing.xxs },
  timeUnread: { color: colors.blue, fontWeight: fontWeights.semibold },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  actionButton: { flex: 1 },
  // Centered on the avatar so it stays put when the text wraps to three lines.
  more: { marginTop: (AVATAR_SIZE - layout.hitTarget) / 2 },
});

export default NotificationRow;
