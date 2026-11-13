import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { AudienceSummary } from '@/lib/types';

import { Face, section } from './Chip';
import type { QueryState } from './hooks';

export const NEARBY_COPY = "+ people nearby when you're together";

type Props = {
  preview: QueryState<AudienceSummary>;
  /** Anyone picked at all (a Circle or a person). */
  picked: boolean;
  open: boolean;
  /** Offline sample data: the server can't be asked. */
  sample: boolean;
};

function names(a: AudienceSummary): string {
  const first = a.people.map((p) => p.first_name);
  return first.length > 3 ? `${first.slice(0, 3).join(', ')} and ${first.length - 3} more` : first.join(', ');
}

/** "Visible to 4 people: Maya, Tony, Jordan and 1 more" from `/audience/preview` (rule 1.5.4). Tap for everyone. */
export function AudienceLine({ preview, picked, open, sample }: Props) {
  const [sheet, setSheet] = useState(false);
  const a = preview.data;

  if (sample) return <Line icon="lock" text="You're offline, so we can't check who would see this." />;
  if (!picked) return <Line icon="lock" text="Pick a Circle or friends. Moves are never public." />;
  if (preview.error) {
    return (
      <PressableScale onPress={preview.retry} accessibilityRole="button" style={styles.row}>
        <Icon name="info" size={14} color={colors.badgeRed} />
        <Text style={section.error}>Couldn't check who can see this · Tap to retry</Text>
      </PressableScale>
    );
  }
  if (!a) return <Line icon="lock" text="Checking who can see this…" busy />;
  if (a.count === 0) return <Line icon="lock" text="Nobody can see this yet. Add a friend or a Circle with people in it." />;

  const people = `${a.count} ${a.count === 1 ? 'person' : 'people'}`;
  return (
    <>
      <PressableScale
        onPress={() => setSheet(true)}
        style={styles.card}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`Visible to ${people}. See everyone`}
      >
        <Icon name="lock" size={15} color={colors.textSecondary} />
        <View style={styles.flex}>
          <Text style={styles.text}>
            Visible to {people}: {names(a)}
          </Text>
          {a.circles.length ? <Text style={section.meta}>Includes {a.circles.map((c) => c.name).join(', ')}</Text> : null}
          {open ? <Text style={section.meta}>{NEARBY_COPY}</Text> : null}
        </View>
        {preview.loading ? <ActivityIndicator size="small" /> : <Icon name="chevron-right" size={16} color={colors.textSecondary} />}
      </PressableScale>
      <AudienceSheet audience={a} open={open} visible={sheet} onClose={() => setSheet(false)} />
    </>
  );
}

function Line({ icon, text, busy }: { icon: 'lock'; text: string; busy?: boolean }) {
  return (
    <View style={styles.row}>
      {busy ? <ActivityIndicator size="small" /> : <Icon name={icon} size={14} color={colors.textSecondary} />}
      <Text style={styles.plain}>{text}</Text>
    </View>
  );
}

type SheetProps = { audience: AudienceSummary; open: boolean; visible: boolean; onClose: () => void };

/** Everyone who will see the Move, as the server resolved it (blocked people already dropped). */
function AudienceSheet({ audience, open, visible, onClose }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <ScreenHeader variant="compact" title="Who can see this" backIcon="close" onBack={onClose} />
        <ScrollView contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={section.sub}>
            {audience.count} {audience.count === 1 ? 'person' : 'people'} will see this Move on their map.
            {open ? " It's Open, so people nearby can see it too when you're together." : ''}
          </Text>
          {audience.circles.length ? (
            <Text style={section.meta}>From {audience.circles.map((c) => c.name).join(', ')}</Text>
          ) : null}
          {audience.people.map((p) => (
            <View key={p.id} style={styles.person}>
              <Face user={p} size={40} />
              <Text style={typeScale.name}>{p.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  plain: { ...typeScale.rowSub, flexShrink: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  text: { ...typeScale.rowSub, color: colors.text },
  sheet: { flex: 1, backgroundColor: colors.white },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
