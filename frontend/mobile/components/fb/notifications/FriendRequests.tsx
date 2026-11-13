import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import type { Notification } from '@/lib/mock';
import { colors, fontWeights, layout, motion, radius, spacing } from '@/lib/theme';

import { compactTime, NOTIFICATION_AVATAR_SIZE, resolvedSegments } from './NotificationRow';
import type { RequestResolution } from './types';

const BUTTON_HEIGHT = 40;

/** Fades its children in once on mount: used when a friend request resolves in place. */
function FadeIn({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withTiming(1, { duration: motion.slow }));
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export type FriendRequestCardProps = {
  notification: Notification;
  resolution?: RequestResolution;
  onPress: (id: string) => void;
  onConfirm: (id: string) => void;
  onDelete: (id: string) => void;
};

function FriendRequestCardBase({ notification, resolution, onPress, onConfirm, onDelete }: FriendRequestCardProps) {
  const { id, actor } = notification;
  const name = actor?.name ?? notification.segments.find((s) => s.bold)?.text ?? 'Someone';
  const age = compactTime(notification.timeLabel);

  return (
    <PressableScale
      onPress={() => onPress(id)}
      scaleTo={1}
      pressedOpacity={0.7}
      accessibilityLabel={`Friend request from ${name}, ${notification.timeLabel} ago${
        notification.detail ? `. ${notification.detail}` : ''
      }`}
      style={styles.row}
    >
      <Avatar source={notification.avatar} size={NOTIFICATION_AVATAR_SIZE} />

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
          <Text style={styles.age}>{` ${age}`}</Text>
        </Text>
        {notification.detail ? (
          <Text style={styles.detail} numberOfLines={1}>
            {notification.detail}
          </Text>
        ) : null}

        {resolution ? (
          <FadeIn key={resolution}>
            <Text style={styles.resolved} accessibilityLiveRegion="polite">
              {resolvedSegments(notification, resolution).map((segment, index) => (
                <Text key={index} style={segment.bold ? styles.resolvedBold : undefined}>
                  {segment.text}
                </Text>
              ))}
            </Text>
          </FadeIn>
        ) : (
          <View style={styles.actions}>
            <Button
              title="Confirm"
              size="lg"
              onPress={() => onConfirm(id)}
              accessibilityLabel={`Confirm friend request from ${name}`}
              style={styles.button}
            />
            <Button
              title="Delete"
              variant="secondary"
              size="lg"
              onPress={() => onDelete(id)}
              accessibilityLabel={`Delete friend request from ${name}`}
              style={[styles.button, styles.secondary]}
            />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

/** One pending request: 64pt avatar, name + age, mutual friends, and Confirm / Delete. */
export const FriendRequestCard = memo(FriendRequestCardBase);

export type SeeFriendRequestsLinkProps = {
  count: number;
  onPress: () => void;
};

/** Centered gray "See N friend requests ›" under the request module. */
export function SeeFriendRequestsLink({ count, onPress }: SeeFriendRequestsLinkProps) {
  const label = `See ${count} friend ${count === 1 ? 'request' : 'requests'}`;
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      pressedOpacity={0.5}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={styles.link}
    >
      <Text style={styles.linkLabel}>{label}</Text>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} />
    </PressableScale>
  );
}

export type SeePreviousButtonProps = {
  onPress: () => void;
};

/** Full-width gray "See previous notifications" button at the end of the list. */
export function SeePreviousButton({ onPress }: SeePreviousButtonProps) {
  return (
    <Button
      title="See previous notifications"
      variant="secondary"
      size="lg"
      onPress={onPress}
      style={[styles.secondary, styles.previous]}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: layout.gutter + spacing.xxs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  body: { flex: 1, marginLeft: spacing.lg, paddingTop: spacing.xs },
  name: { fontSize: 18, lineHeight: 23, fontWeight: fontWeights.medium, color: colors.text },
  age: { fontSize: 17, fontWeight: fontWeights.regular, color: colors.textSecondary },
  detail: { fontSize: 15, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.xxs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  button: { flex: 1, height: BUTTON_HEIGHT, borderRadius: radius.md },
  secondary: { backgroundColor: colors.buttonSecondary },
  resolved: { fontSize: 15, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.md },
  resolvedBold: { fontWeight: fontWeights.semibold, color: colors.text },
  link: {
    minHeight: layout.hitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  linkLabel: { fontSize: 17, lineHeight: 22, fontWeight: fontWeights.semibold, color: colors.textSecondary },
  previous: {
    height: BUTTON_HEIGHT + 4,
    borderRadius: radius.md,
    marginHorizontal: layout.gutter + spacing.xxs,
    marginTop: spacing.md,
  },
});
