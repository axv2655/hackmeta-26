import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useMuseSearch } from '@/lib/museSearch';
import { spacing } from '@/lib/theme';
import type { MuseSearchClarify as Clarify, MuseSearchClarifyOption } from '@/lib/types';

import { searchStyles } from './searchStyles';

/** What tapping an option sends back: same request plus the pick. Null when the option carries no id. */
function answerFor(clarify: Clarify, option: MuseSearchClarifyOption): (() => void) | null {
  const store = useMuseSearch.getState();
  if (clarify.field === 'person' && option.user_id) {
    const userId = option.user_id;
    return () => void store.pickPerson(clarify.name ?? option.label, userId);
  }
  if (clarify.field === 'place' && option.mark_id) {
    const markId = option.mark_id;
    return () => void store.pickPlace(markId);
  }
  return null;
}

/**
 * Muse's follow-up question ("Which Div?"): one button per option, or type a
 * reply in the prompt box. A "text" clarify has no options: typing is the only answer.
 */
export function MuseSearchClarify({ clarify }: { clarify: Clarify }) {
  const options = clarify.options
    .map((o) => ({ option: o, onPress: answerFor(clarify, o) }))
    .filter((o): o is { option: MuseSearchClarifyOption; onPress: () => void } => o.onPress !== null);

  return (
    <View style={searchStyles.card}>
      <Text style={searchStyles.title}>{clarify.question}</Text>
      {options.length > 0 ? (
        <View style={styles.options}>
          {options.map(({ option, onPress }) => (
            <Button
              key={`${option.user_id ?? ''}:${option.mark_id ?? ''}:${option.label}`}
              title={option.label}
              size="sm"
              variant="tinted"
              onPress={onPress}
            />
          ))}
        </View>
      ) : null}
      <Text style={searchStyles.meta}>{options.length > 0 ? 'Or type your answer above.' : 'Type your answer above.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

export default MuseSearchClarify;
