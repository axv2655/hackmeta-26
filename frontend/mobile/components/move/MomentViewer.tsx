import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ago } from '@/lib/format';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Moment } from '@/lib/types';

import { MomentImage } from './MomentImage';
import { needsMyAnswer, wereHere } from './momentText';

type Props = {
  moment: Moment | null;
  myId: string;
  onClose: () => void;
  onAnswer: (momentId: string, approve: boolean) => void;
};

/** Full-screen view of one Moment, with Approve / Decline when I'm tagged and haven't answered. */
export function MomentViewer({ moment, myId, onClose, onAnswer }: Props) {
  const insets = useSafeAreaInsets();
  const ask = moment ? needsMyAnswer(moment, myId) : false;
  const declined = moment?.tags.some((t) => t.user.id === myId && t.approved === false) ?? false;

  return (
    <Modal visible={moment !== null} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Icon name="close" size={26} color={colors.darkText} />
          </Pressable>
          {moment?.status === 'pending' ? (
            <View style={styles.pending}>
              <Text style={styles.pendingText}>Waiting on approval</Text>
            </View>
          ) : null}
        </View>
        {moment ? (
          <>
            <MomentImage moment={moment} fit="contain" style={styles.image} />
            <View style={styles.info}>
              <Text style={styles.here}>{wereHere(moment, myId)}</Text>
              {moment.caption ? <Text style={styles.caption}>{moment.caption}</Text> : null}
              <Text style={styles.meta}>
                Posted by {moment.author.id === myId ? 'you' : moment.author.first_name} · {ago(moment.created_at)}
              </Text>
              {ask ? (
                <View style={styles.ask}>
                  <Text style={styles.caption}>You're tagged. Friends only see this once everyone tagged says OK.</Text>
                  <View style={styles.row}>
                    <Button title="Approve" style={styles.flex} onPress={() => onAnswer(moment.id, true)} />
                    <Button
                      title="Decline"
                      variant="secondary"
                      style={styles.flex}
                      onPress={() => onAnswer(moment.id, false)}
                    />
                  </View>
                </View>
              ) : null}
              {declined ? <Text style={styles.meta}>You declined this one, so it stays hidden.</Text> : null}
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.darkBg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pending: { backgroundColor: colors.darkHairline, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pendingText: { ...typeScale.label, color: colors.darkText },
  image: { flex: 1, backgroundColor: colors.darkBg },
  info: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  here: { ...typeScale.name, color: colors.darkText },
  caption: { ...typeScale.body, color: colors.darkText },
  meta: { ...typeScale.meta, color: colors.darkTextSecondary },
  ask: { gap: spacing.sm, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
