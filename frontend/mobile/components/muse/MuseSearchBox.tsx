import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { BottomSheetTextInput, useBottomSheet } from '@gorhom/bottom-sheet';

import { Icon } from '@/components/ui/Icon';
import { awaitingReply, MAX_PROMPT, useMuseSearch } from '@/lib/museSearch';
import { colors } from '@/lib/theme';

/** Short enough to fit the pill on a small phone; the full examples live in docs/MUSE_SEARCH.md. */
const PLACEHOLDER = 'Ask Muse to plan a Move';
const REPLY_PLACEHOLDER = 'Reply to Muse…';
/** Sheet detent that shows the answer card (the half detent). */
const ANSWER_DETENT = 1;

/**
 * The map's prompt box. Return asks Muse (or answers its clarify question);
 * the x clears the text and any answer. Muse never runs until the user submits.
 */
export function MuseSearchBox() {
  const [text, setText] = useState('');
  const replying = useMuseSearch(awaitingReply);
  const active = useMuseSearch((s) => s.status !== 'idle');
  const { snapToIndex } = useBottomSheet();

  // Wait for the keyboard to go so the sheet's keyboard "restore" does not undo the snap.
  const reveal = () => {
    if (!Keyboard.isVisible()) return snapToIndex(ANSWER_DETENT);
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      sub.remove();
      snapToIndex(ANSWER_DETENT);
    });
  };

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    const store = useMuseSearch.getState();
    void (replying ? store.reply(value) : store.ask(value));
    setText('');
    reveal();
  };

  const clear = () => {
    setText('');
    useMuseSearch.getState().clear();
  };

  return (
    <View style={styles.pill}>
      <Icon name="sparkles" size={20} color={colors.textSecondary} />
      <BottomSheetTextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        placeholder={replying ? REPLY_PLACEHOLDER : PLACEHOLDER}
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        returnKeyType="send"
        submitBehavior="blurAndSubmit"
        maxLength={MAX_PROMPT}
        autoCorrect
        accessibilityLabel="Ask Muse"
      />
      {text || active ? (
        <Pressable onPress={clear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear">
          <Icon name="x-circle" size={18} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(118,118,128,0.14)',
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    paddingVertical: 0,
  },
});

export default MuseSearchBox;
