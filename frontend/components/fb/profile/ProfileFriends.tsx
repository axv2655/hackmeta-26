import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { formatCount } from '@/lib/mock';
import type { User } from '@/lib/mock';
import { colors, hairlineWidth, radii, spacing, type as typeScale } from '@/lib/theme';

import { sectionStyles } from './sectionStyles';

const COLUMNS = 3;

export type ProfileFriendsProps = {
  friends: User[];
  friendCount: number;
  onPressFriend?: (friend: User) => void;
  onPressSeeAll?: () => void;
  onPressFind?: () => void;
};

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** "Friends" section: count, 3x2 grid of rounded-square photos with names, "See all friends". */
export function ProfileFriends({ friends, friendCount, onPressFriend, onPressSeeAll, onPressFind }: ProfileFriendsProps) {
  const rows = chunk(friends.slice(0, COLUMNS * 2), COLUMNS);

  return (
    <View style={sectionStyles.section}>
      <View style={sectionStyles.headingRow}>
        <View>
          <Text style={sectionStyles.heading} accessibilityRole="header">
            Friends
          </Text>
          <Text style={sectionStyles.subheading}>{formatCount(friendCount)} friends</Text>
        </View>
        <PressableScale
          onPress={onPressFind}
          scaleTo={1}
          pressedOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          accessibilityRole="link"
          accessibilityLabel="Find friends"
        >
          <Text style={sectionStyles.link}>Find friends</Text>
        </PressableScale>
      </View>

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.gridRow}>
            {row.map((friend) => (
              <PressableScale
                key={friend.id}
                onPress={() => onPressFriend?.(friend)}
                pressedOpacity={0.8}
                accessibilityLabel={friend.name}
                style={styles.cell}
              >
                <View style={styles.photo}>
                  <Image source={friend.avatar} style={styles.fill} contentFit="cover" transition={0} />
                </View>
                <Text style={styles.friendName} numberOfLines={2}>
                  {friend.name}
                </Text>
              </PressableScale>
            ))}
            {/* Keep a short last row on the 3-column grid. */}
            {Array.from({ length: COLUMNS - row.length }, (_, i) => (
              <View key={`spacer-${i}`} style={styles.cell} />
            ))}
          </View>
        ))}
      </View>

      <Button title="See all friends" variant="secondary" onPress={onPressSeeAll} style={styles.seeAll} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { marginTop: spacing.md, gap: spacing.md },
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.grayButton,
    borderWidth: hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  fill: { width: '100%', height: '100%' },
  friendName: { ...typeScale.label, fontSize: 14, lineHeight: 18, marginTop: spacing.xs + 2 },
  seeAll: { marginTop: spacing.lg },
});

export default ProfileFriends;
