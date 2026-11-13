import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useMuseSearch } from '@/lib/museSearch';
import { colors, spacing } from '@/lib/theme';
import type { MuseSearchResult } from '@/lib/types';

import { MuseSearchClarify } from './MuseSearchClarify';
import { MuseSearchDraftCard } from './MuseSearchDraftCard';
import { MuseSearchPeople } from './MuseSearchPeople';
import { MuseSearchPlaces } from './MuseSearchPlaces';
import { searchStyles } from './searchStyles';

/**
 * Muse's answer to the map's prompt box, shown at the top of the Moves sheet.
 * Renders nothing until the user asks. Errors stay inline with a retry.
 */
export function MuseSearchPanel() {
  const status = useMuseSearch((s) => s.status);
  const prompt = useMuseSearch((s) => s.prompt);
  const result = useMuseSearch((s) => s.result);
  const error = useMuseSearch((s) => s.error);

  if (status === 'idle') return null;
  return (
    <View style={styles.wrap}>
      {prompt ? (
        <Text style={styles.prompt} numberOfLines={2}>
          “{prompt}”
        </Text>
      ) : null}
      {status === 'loading' ? <Thinking /> : null}
      {status === 'error' ? <Failed message={error} /> : null}
      {status === 'ready' && result ? <Answer result={result} /> : null}
    </View>
  );
}

function Thinking() {
  return (
    <View style={[searchStyles.card, styles.inline]} accessibilityRole="progressbar" accessibilityLabel="Muse is thinking">
      <ActivityIndicator color={colors.textSecondary} />
      <Text style={searchStyles.meta}>Muse is thinking…</Text>
    </View>
  );
}

function Failed({ message }: { message: string | null }) {
  return (
    <View style={searchStyles.card} accessibilityRole="alert">
      <View style={styles.inline}>
        <Icon name="info" size={18} color={colors.textSecondary} />
        <Text style={[searchStyles.meta, searchStyles.flex]}>{message ?? 'Muse couldn’t answer that.'}</Text>
      </View>
      <View style={searchStyles.actions}>
        <Button
          title="Try again"
          size="sm"
          variant="secondary"
          style={searchStyles.flex}
          onPress={() => void useMuseSearch.getState().retry()}
        />
        <Button
          title="Never mind"
          size="sm"
          variant="secondary"
          style={searchStyles.flex}
          onPress={() => useMuseSearch.getState().clear()}
        />
      </View>
    </View>
  );
}

function Answer({ result }: { result: MuseSearchResult }) {
  return (
    <>
      <View style={styles.header}>
        <MuseBadge source={result.source} />
        {result.message ? <Text style={styles.message}>{result.message}</Text> : null}
      </View>
      <Card result={result} />
    </>
  );
}

function Card({ result }: { result: MuseSearchResult }) {
  switch (result.kind) {
    case 'draft':
      return result.draft ? <MuseSearchDraftCard draft={result.draft} /> : null;
    case 'people':
      // Keyed by the set so a new answer starts with everyone picked again.
      return (
        <MuseSearchPeople
          key={result.people.map((p) => p.user_id).join(',')}
          people={result.people}
          source={result.source}
        />
      );
    case 'places':
      return <MuseSearchPlaces places={result.places} source={result.source} />;
    case 'clarify':
      return result.clarify ? <MuseSearchClarify clarify={result.clarify} /> : null;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  prompt: { fontSize: 14, lineHeight: 18, color: colors.textSecondary, fontStyle: 'italic', marginLeft: spacing.xs },
  header: { gap: 6, marginTop: spacing.sm, marginLeft: spacing.xs },
  message: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

export default MuseSearchPanel;
