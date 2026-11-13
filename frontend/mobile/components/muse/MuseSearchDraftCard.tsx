import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { success } from '@/lib/haptics';
import { useMuseSearch } from '@/lib/museSearch';
import { colors, spacing } from '@/lib/theme';
import type { MuseSearchDraft } from '@/lib/types';

import { searchStyles } from './searchStyles';

/** "Divy Shah", "Divy and Tony", "Divy, Tony and 2 more". */
function recipientLine(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/**
 * Muse's held draft. The audience line is always visible (rule 4) and nothing
 * posts until Send (rule 6); Cancel just drops it (drafts expire on their own).
 */
export function MuseSearchDraftCard({ draft }: { draft: MuseSearchDraft }) {
  const posting = useMuseSearch((s) => s.posting);

  const send = async () => {
    if (await useMuseSearch.getState().confirm()) success();
  };

  return (
    <View style={searchStyles.card} accessibilityLabel={`Draft Move: ${draft.text}. ${draft.audience}`}>
      <Text style={searchStyles.title}>{draft.text}</Text>
      {draft.place ? (
        <View style={styles.line}>
          <Icon name="map-pin" size={15} color={colors.textSecondary} />
          <Text style={searchStyles.meta} numberOfLines={1}>
            {draft.place}
          </Text>
        </View>
      ) : null}
      {draft.recipients.length > 0 ? (
        <View style={styles.line}>
          <Icon name="users" size={15} color={colors.textSecondary} />
          <Text style={searchStyles.meta} numberOfLines={1}>
            {recipientLine(draft.recipients)}
          </Text>
        </View>
      ) : null}
      <View style={styles.audience}>
        <Icon name="eye" size={15} color={colors.chipSelectedText} />
        <Text style={styles.audienceText}>{draft.audience}</Text>
      </View>
      <View style={searchStyles.actions}>
        <Button
          title={posting ? 'Sending…' : 'Send'}
          size="sm"
          icon={posting ? undefined : 'send'}
          left={posting ? <ActivityIndicator size="small" color={colors.white} /> : undefined}
          disabled={posting}
          style={searchStyles.flex}
          onPress={() => void send()}
        />
        <Button
          title="Cancel"
          size="sm"
          variant="secondary"
          disabled={posting}
          style={searchStyles.flex}
          onPress={() => useMuseSearch.getState().clear()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  audience: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.chipSelectedBg,
  },
  audienceText: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.chipSelectedText },
});

export default MuseSearchDraftCard;
