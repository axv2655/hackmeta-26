import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { categoryMeta } from '@/lib/categories';
import type { MyListRow } from '@/lib/types';
import { colors, fontWeights, spacing, type as typeScale } from '@/lib/theme';

import { sectionStyles } from './sectionStyles';

export type ProfileListCardProps = {
  status: 'loading' | 'ready' | 'error';
  rows: MyListRow[];
  error: string | null;
  onOpen: () => void;
  onRetry: () => void;
};

function Row({ row }: { row: MyListRow }) {
  return (
    <View style={styles.row}>
      <Text style={styles.position}>{row.position}</Text>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {row.mark.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {categoryMeta(row.category).label}
        </Text>
      </View>
      <Text style={styles.score}>{row.score.toFixed(1)}</Text>
    </View>
  );
}

function Body({ status, rows, error, onRetry }: Omit<ProfileListCardProps, 'onOpen'>) {
  if (status === 'loading') return <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />;
  if (status === 'error' && rows.length === 0) {
    return (
      <PressableScale onPress={onRetry} scaleTo={1} pressedOpacity={0.6} accessibilityRole="button">
        <Text style={styles.sub}>{error ?? "Couldn't load your list"}. Tap to try again.</Text>
      </PressableScale>
    );
  }
  if (rows.length === 0) return <Text style={styles.sub}>Rank a spot after a Move to start your list.</Text>;
  return (
    <>
      {rows.map((row) => (
        <Row key={row.mark.id} row={row} />
      ))}
    </>
  );
}

/** "Your list": the top 3 spots you have ranked. Opens the leaderboards. */
export function ProfileListCard(props: ProfileListCardProps) {
  return (
    <View style={sectionStyles.section}>
      <PressableScale
        onPress={props.onOpen}
        scaleTo={1}
        pressedOpacity={0.6}
        accessibilityRole="link"
        accessibilityLabel="Your list. See leaderboards"
        style={sectionStyles.headingRow}
      >
        <Text style={sectionStyles.heading} accessibilityRole="header">
          Your list
        </Text>
        <View style={styles.seeAll}>
          <Text style={sectionStyles.link}>Leaderboards</Text>
          <Icon name="chevron-right" size={18} color={colors.blue} />
        </View>
      </PressableScale>
      <View style={styles.body}>
        <Body status={props.status} rows={props.rows} error={props.error} onRetry={props.onRetry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  seeAll: { flexDirection: 'row', alignItems: 'center' },
  body: { marginTop: spacing.md, gap: spacing.sm },
  spinner: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  position: { width: 24, fontSize: 17, fontWeight: fontWeights.bold, color: colors.textSecondary, textAlign: 'center' },
  rowText: { flex: 1 },
  name: { ...typeScale.row, fontWeight: fontWeights.semibold },
  sub: { ...typeScale.rowSub },
  score: { fontSize: 15, fontWeight: fontWeights.bold, color: colors.blue },
});

export default ProfileListCard;
