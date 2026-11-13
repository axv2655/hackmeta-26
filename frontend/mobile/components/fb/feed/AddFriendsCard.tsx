import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { colors, fontWeights, spacing, type as typeScale } from '@/lib/theme';

export type AddFriendsCardProps = {
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Pale blue used only by this illustration; there is no theme token for it. */
const ILLUSTRATION_LIGHT_BLUE = '#A8C7FA';

/** Two abstract people: a gray figure with a pale-blue face, and a rounder one with a blue face. */
function FriendsIllustration() {
  return (
    <Svg width={92} height={86} viewBox="0 0 92 86" fill="none">
      {/* Left figure */}
      <Path d="M0 45a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v41H0z" fill={colors.band} />
      <Path d="M12 3a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v12H12z" fill={colors.text} />
      <Rect x={12} y={9} width={20} height={27} rx={10} fill={ILLUSTRATION_LIGHT_BLUE} />
      {/* Right figure */}
      <Path d="M32 86a30 32 0 0 1 60 0z" fill={colors.placeholder} />
      <Circle cx={57} cy={18} r={8} fill={colors.band} />
      <Circle cx={63.5} cy={37} r={12.5} fill={colors.band} />
      <Path d="M51.66 33a12.5 12.5 0 1 0 23.68 0q-11.84-6-23.68 0z" fill={colors.blue} />
    </Svg>
  );
}

/** End-of-feed prompt: "Add friends to see more posts" with a blue call to action. */
export function AddFriendsCard({ onPress, style }: AddFriendsCardProps) {
  return (
    <View style={[styles.root, style]}>
      <FriendsIllustration />
      <Text style={styles.title}>Add friends to see more posts</Text>
      <Text style={styles.body}>
        {"The more friends you add on Facebook, the more posts, photos and videos you'll see in your Feed."}
      </Text>
      <Button title="Add friends" size="lg" onPress={onPress} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingTop: 40,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  title: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  body: {
    ...typeScale.prompt,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  button: { marginTop: spacing.lg, paddingHorizontal: 14 },
});

export default AddFriendsCard;
