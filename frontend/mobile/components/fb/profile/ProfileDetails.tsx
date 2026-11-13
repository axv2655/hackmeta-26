import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

import { profileDetails, type DetailIcon } from './data';
import { sectionStyles } from './sectionStyles';

const ICON_SIZE = 26;

export type ProfileDetailsProps = {
  onPressSeeAll?: () => void;
  /** @deprecated The "Edit public details" button was removed with the redesign. */
  onPressEdit?: () => void;
  /** @deprecated Use `onPressSeeAll`. */
  onPressAbout?: () => void;
};

/** Two interlocking rings: the gender glyph lucide does not have. */
function GenderGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={8.5} cy={12} r={6} stroke={color} strokeWidth={1.8} />
      <Circle cx={15.5} cy={12} r={6} stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

function DetailGlyph({ icon }: { icon: DetailIcon }) {
  if (icon === 'gender') return <GenderGlyph size={ICON_SIZE} color={colors.text} />;
  return <Icon name={icon} size={ICON_SIZE} color={colors.text} strokeWidth={1.7} />;
}

/** "At a glance": heading with a blue "See all" link, then outline-icon rows (Lives in, From, ...). */
export function ProfileDetails({ onPressSeeAll, onPressAbout }: ProfileDetailsProps) {
  return (
    <View style={[sectionStyles.section, styles.section]}>
      <View style={styles.headingRow}>
        <Text style={sectionStyles.heading} accessibilityRole="header">
          At a glance
        </Text>
        {(onPressSeeAll ?? onPressAbout) ? (
          <PressableScale
            onPress={onPressSeeAll ?? onPressAbout}
            scaleTo={1}
            pressedOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel="See all of your About info"
          >
            <Text style={sectionStyles.link}>See all</Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={styles.list}>
        {profileDetails.map((detail) => (
          <View key={detail.id} style={styles.row}>
            <View style={styles.iconBox}>
              <DetailGlyph icon={detail.icon} />
            </View>
            <Text style={styles.rowText}>
              {detail.prefix ? (
                <>
                  {detail.prefix} <Text style={styles.rowValue}>{detail.value}</Text>
                </>
              ) : (
                detail.value
              )}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: spacing.xxl, paddingBottom: spacing.lg },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  list: { marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: layout.hitTarget - spacing.xs,
    paddingVertical: spacing.xxs,
  },
  iconBox: { width: 28, alignItems: 'center' },
  rowText: { ...typeScale.row, flex: 1 },
  rowValue: { fontWeight: fontWeights.semibold },
});

export default ProfileDetails;
