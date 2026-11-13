import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';
import type { AudienceSummary, Invite } from '@/lib/types';

const SHOWN = 4;

/** "Visible to 6: Roommates, Maya, Priya + 2 more". */
export function audienceLine(a: AudienceSummary): string {
  const names = [...a.circles.map((c) => c.name), ...a.people.map((p) => p.first_name)];
  if (names.length === 0) return `Visible to ${a.count}`;
  const head = names.slice(0, SHOWN).join(', ');
  const more = names.length > SHOWN ? ` + ${names.length - SHOWN} more` : '';
  return `Visible to ${a.count}: ${head}${more}`;
}

type InviteState = { status: 'loading' | 'ready' | 'error'; items: Invite[]; error: string | null };

function useInvites(moveId: string) {
  const [state, setState] = useState<InviteState>({ status: 'loading', items: [], error: null });
  const load = useCallback(async () => {
    try {
      const items = await endpoints.moves.invites(moveId);
      setState({ status: 'ready', items, error: null });
    } catch (e) {
      setState((s) => (s.status === 'ready' ? s : { status: 'error', items: [], error: errorMessage(e) }));
    }
  }, [moveId]);
  useEffect(() => {
    void load();
    return appEvents.on('invites.changed', () => void load());
  }, [load]);
  return { ...state, load };
}

function InviteStats({ status, items, error, load }: ReturnType<typeof useInvites>) {
  if (status === 'loading') return <Text style={typeScale.meta}>Checking your links…</Text>;
  if (status === 'error') {
    return (
      <Pressable onPress={() => void load()} accessibilityRole="button">
        <Text style={typeScale.meta}>Couldn't load link stats ({error}). Tap to retry.</Text>
      </Pressable>
    );
  }
  if (items.length === 0) return <Text style={typeScale.meta}>No links sent yet. Share to invite someone off the app.</Text>;
  const opened = items.reduce((n, i) => n + i.open_count, 0);
  const guests = items.filter((i) => i.responded_at);
  const names = guests.map((g) => g.guest_name).filter(Boolean).join(', ');
  return (
    <View style={styles.stats}>
      <Text style={typeScale.meta}>
        {items.length} {items.length === 1 ? 'link' : 'links'} sent · opened {opened} {opened === 1 ? 'time' : 'times'}
      </Text>
      <Text style={typeScale.meta}>
        {guests.length === 0
          ? 'No guests have pulled up yet'
          : `${guests.length} ${guests.length === 1 ? 'guest' : 'guests'} pulled up${names ? `: ${names}` : ''}`}
      </Text>
    </View>
  );
}

/** Creator only: exactly who can see this Move, plus how shared links are doing. */
export function AudienceCard({ moveId, audience }: { moveId: string; audience: AudienceSummary }) {
  const invites = useInvites(moveId);
  const hasLinks = invites.items.length > 0;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="users" size={18} color={colors.textSecondary} />
        <Text style={[typeScale.rowSub, styles.flex]}>
          {audienceLine(audience)}
          {hasLinks ? ' + anyone you send a link to' : ''}
        </Text>
      </View>
      <View style={styles.row}>
        <Icon name="link" size={18} color={colors.textSecondary} />
        <View style={styles.flex}>
          <InviteStats {...invites} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  stats: { gap: 2 },
});
