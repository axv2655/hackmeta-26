import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, radius, spacing, type as typeScale } from '@/lib/theme';

import { museCard } from './data';

export type ProfileMuseCardProps = {
  onPressTry?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Dismissible light-gray promo card for Muse, our AI agent: script "m" mark, copy, X, and "Try Muse". */
export function ProfileMuseCard({ onPressTry, onDismiss, style }: ProfileMuseCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.top}>
        <Text style={styles.mark} accessible={false} allowFontScaling={false}>
          m
        </Text>
        <View style={styles.copy}>
          <Text style={styles.title} accessibilityRole="header">
            {museCard.title}
          </Text>
          <Text style={styles.body}>{museCard.body}</Text>
        </View>
        <IconButton
          name="close"
          size={18}
          background
          backgroundSize={34}
          backgroundColor={colors.grayButton}
          hitSize={40}
          accessibilityLabel="Dismiss Muse"
          onPress={onDismiss}
          style={styles.close}
        />
      </View>

      <PressableScale
        onPress={onPressTry}
        haptic
        scaleTo={0.98}
        pressedOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={museCard.cta}
        style={styles.cta}
      >
        <Text style={styles.ctaText}>{museCard.cta}</Text>
      </PressableScale>
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
  copy: { flex: 1, marginLeft: spacing.sm, marginRight: spacing.xs },
  title: { ...typeScale.row, fontWeight: fontWeights.medium },
  body: { ...typeScale.body, fontSize: 15, lineHeight: 20, marginTop: spacing.xxs },
  close: { marginTop: -spacing.xs, marginRight: -spacing.xs },
  cta: {
    height: 40,
    marginTop: spacing.md + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chipSelectedBg,
  },
  ctaText: { ...typeScale.buttonLarge, fontSize: 16, lineHeight: 21, color: colors.chipSelectedText },
});

export default ProfileMuseCard;
