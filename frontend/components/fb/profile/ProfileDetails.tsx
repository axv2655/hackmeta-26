import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontWeights, layout, spacing, type as typeScale } from '@/lib/theme';

import { profileDetails } from './data';
import { sectionStyles } from './sectionStyles';

export type ProfileDetailsProps = {
  onPressEdit?: () => void;
  onPressAbout?: () => void;
};

/** "Details" list: school, current city, hometown, join date. */
export function ProfileDetails({ onPressEdit, onPressAbout }: ProfileDetailsProps) {
  return (
    <View style={sectionStyles.section}>
      <Text style={sectionStyles.heading} accessibilityRole="header">
        Details
      </Text>

      <View style={styles.list}>
        {profileDetails.map((detail) => (
          <View key={detail.id} style={styles.row}>
            <Icon name={detail.icon} size={22} color={colors.placeholder} />
            <Text style={styles.rowText}>
              {detail.prefix} <Text style={styles.rowValue}>{detail.value}</Text>
            </Text>
          </View>
        ))}
        <PressableScale
          onPress={onPressAbout}
          scaleTo={1}
          pressedOpacity={0.6}
          accessibilityRole="link"
          accessibilityLabel="See your About info"
          style={[styles.row, styles.aboutRow]}
        >
          <Icon name="more" size={22} color={colors.placeholder} />
          <Text style={styles.rowText}>See your About info</Text>
        </PressableScale>
      </View>

      <Button title="Edit public details" variant="tinted" onPress={onPressEdit} style={styles.editButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  // Stretches the last row to a 44pt target without changing the rhythm much.
  aboutRow: { minHeight: layout.hitTarget, paddingVertical: 0 },
  rowText: { ...typeScale.body, flex: 1 },
  rowValue: { fontWeight: fontWeights.semibold },
  editButton: { marginTop: spacing.sm },
});

export default ProfileDetails;
