import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { IconButton } from '@/components/ui/IconButton';
import type { Taste } from '@/lib/types';
import { colors, fontWeights, radius, spacing, type as typeScale } from '@/lib/theme';

export type ProfileMuseCardProps = {
  taste: Taste;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** What Muse has learned from your ratings: "Muse thinks you like ...", with the top likes as chips. */
export function ProfileMuseCard({ taste, onDismiss, style }: ProfileMuseCardProps) {
  const likes = taste.likes.slice(0, 4);
  return (
    <View style={[styles.card, style]}>
      <View style={styles.top}>
        <Text style={styles.mark} accessible={false} allowFontScaling={false}>
          m
        </Text>
        <View style={styles.copy}>
          <MuseBadge />
          <Text style={styles.body}>Muse thinks you like {taste.summary}</Text>
        </View>
        {onDismiss ? (
          <IconButton
            name="close"
            size={18}
            background
            backgroundSize={34}
            backgroundColor={colors.grayButton}
            hitSize={40}
            accessibilityLabel="Hide taste card"
            onPress={onDismiss}
            style={styles.close}
          />
        ) : null}
      </View>
      {likes.length > 0 ? (
        <View style={styles.chips}>
          {likes.map((like) => (
            <Text key={like} style={styles.chip}>
              {like}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  // Script "m" in Snell Roundhand (bundled with iOS), standing in for the Muse logo.
  mark: {
    width: 40,
    marginTop: -6,
    fontFamily: 'SnellRoundhand-Black',
    fontSize: 38,
    lineHeight: 44,
    color: colors.blue,
  },
  copy: { flex: 1, marginLeft: spacing.sm, marginRight: spacing.xs, gap: spacing.xs, alignItems: 'flex-start' },
  body: { ...typeScale.body, fontSize: 16, lineHeight: 21, fontWeight: fontWeights.medium },
  close: { marginTop: -spacing.xs, marginRight: -spacing.xs },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginLeft: 40 + spacing.sm,
  },
  chip: {
    ...typeScale.label,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});

export default ProfileMuseCard;
