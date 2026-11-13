import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { Icon, type IconName } from '@/components/ui/Icon';
import type { LifeEvent, LifeEventKind } from '@/lib/mock';
import { colors, layout, spacing, type as typeScale } from '@/lib/theme';

export type LifeEventPostProps = {
  event: LifeEvent;
  style?: StyleProp<ViewStyle>;
};

const DISC = 48;

const HEART =
  'M12 20.7C5.6 16.4 3 13.1 3 9.6 3 6.9 5.1 4.8 7.7 4.8c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.6 0 4.7 2.1 4.7 4.8 0 3.5-2.6 6.8-9 11.1z';

const KIND_ICON: Record<Exclude<LifeEventKind, 'relationship'>, IconName> = {
  job: 'briefcase',
  school: 'graduation',
  moved: 'map-pin',
};

/** Two white hearts, a big one up right and a small one down left. */
function HeartsGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G transform="translate(7.4 2.2) scale(0.66)">
        <Path d={HEART} fill={colors.white} />
      </G>
      <G transform="translate(1.8 10.6) scale(0.4)">
        <Path d={HEART} fill={colors.white} />
      </G>
    </Svg>
  );
}

/** Centered life-event body: blue disc, big title ("In a relationship"), gray subtitle ("Today"). */
export function LifeEventPost({ event, style }: LifeEventPostProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.disc}>
        {event.kind === 'relationship' ? (
          <HeartsGlyph size={26} />
        ) : (
          <Icon name={KIND_ICON[event.kind]} size={22} color={colors.white} />
        )}
      </View>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.subtitle}>{event.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingHorizontal: layout.gutter,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },
  title: { ...typeScale.eventTitle, textAlign: 'center', marginTop: spacing.sm },
  subtitle: { ...typeScale.body, color: colors.textSecondary, textAlign: 'center', marginTop: 1 },
});

export default LifeEventPost;
