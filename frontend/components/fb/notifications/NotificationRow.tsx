import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/Avatar';
import { IconBadge } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Notification, TextSegment } from '@/lib/mock';
import { colors, fontWeights, layout, motion, spacing } from '@/lib/theme';

import type { RequestResolution } from './types';

export const NOTIFICATION_AVATAR_SIZE = 64;
const BADGE_SIZE = 28;
const BADGE_RING = 2;

// The unread tint is a two-state color flip, so it is a CSS transition rather than a worklet:
// the row background and the ring around the type badge fade together.
const TINT_TRANSITION = {
  transitionProperty: 'backgroundColor',
  transitionDuration: motion.slow,
  transitionTimingFunction: cubicBezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]),
} as const;

/** "6 m" -> "6m": the compact inline time used next to notification text. */
export function compactTime(timeLabel: string): string {
  return timeLabel.replace(/\s+/g, '');
}

/** Text shown once a friend request has been answered. */
export function resolvedSegments(notification: Notification, resolution: RequestResolution): TextSegment[] {
  const name = notification.actor?.name ?? 'this person';
  return resolution === 'confirmed'
    ? [{ text: 'You and ' }, { text: name, bold: true }, { text: ' are now friends.' }]
    : [{ text: 'You removed the friend request from ' }, { text: name, bold: true }, { text: '.' }];
}

/** The segments an item is currently showing (the seeded text, or the resolved friend-request text). */
export function segmentsFor(notification: Notification, resolution?: RequestResolution): TextSegment[] {
  return resolution ? resolvedSegments(notification, resolution) : notification.segments;
}

export type NotificationRowProps = {
  notification: Notification;
  unread: boolean;
  onPress: (id: string) => void;
  onPressMore: (id: string) => void;
};

function NotificationRowBase({ notification, unread, onPress, onPressMore }: NotificationRowProps) {
  const { id, segments } = notification;
  const tint = { backgroundColor: unread ? colors.unread : colors.white };

  const plainText = segments.map((segment) => segment.text).join('');
  const label = `${unread ? 'Unread. ' : ''}${plainText} ${notification.timeLabel} ago`;

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
          size={NOTIFICATION_AVATAR_SIZE}
          badge={
            <Animated.View style={[styles.badgeRing, tint, TINT_TRANSITION]}>
              <IconBadge name={notification.badgeIcon} color={notification.badgeColor} size={BADGE_SIZE} />
            </Animated.View>
          }
        />

        <View style={styles.body}>
          <Text style={styles.text} numberOfLines={4}>
            {segments.map((segment, index) => (
              <Text key={index} style={segment.bold ? styles.bold : undefined}>
                {segment.text}
              </Text>
            ))}
            <Text style={styles.time}>{` ${compactTime(notification.timeLabel)}`}</Text>
          </Text>
        </View>

        <IconButton
          name="more"
          size={24}
          color={colors.text}
          accessibilityLabel="Manage this notification"
          onPress={() => onPressMore(id)}
          style={styles.more}
        />
      </PressableScale>
    </Animated.View>
  );
}

/** One notification: 64pt avatar with a type badge, 17pt rich text with inline time, and a "..." button. */
export const NotificationRow = memo(NotificationRowBase);

const ROW_PADDING_V = 10;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: layout.gutter + spacing.xxs,
    paddingRight: spacing.xxs,
    paddingVertical: ROW_PADDING_V,
    minHeight: NOTIFICATION_AVATAR_SIZE + ROW_PADDING_V * 2,
  },
  badgeRing: {
    padding: BADGE_RING,
    borderRadius: (BADGE_SIZE + BADGE_RING * 2) / 2,
    // Let the badge hang slightly past the avatar's edge, as in the iOS app.
    marginRight: -4,
    marginBottom: -2,
  },
  body: {
    flex: 1,
    minHeight: NOTIFICATION_AVATAR_SIZE,
    justifyContent: 'center',
    marginLeft: spacing.lg,
  },
  text: { fontSize: 17, lineHeight: 22, fontWeight: fontWeights.regular, color: colors.text },
  bold: { fontWeight: fontWeights.semibold },
  time: { fontWeight: fontWeights.regular, color: colors.textSecondary },
  // Top-aligned with the first line of text.
  more: { marginTop: -spacing.xs },
});

export default NotificationRow;
