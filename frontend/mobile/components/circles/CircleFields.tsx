import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

import { EmojiChips } from './EmojiChips';
import type { CircleDraft } from './useCircleDraft';

const MAX_NAME = 40;

/** "Moves shared with Roommates reach 3 people". */
export function audienceEffect(name: string, n: number): string {
  const label = name.trim() || 'this Circle';
  return `Moves shared with ${label} reach ${n} ${n === 1 ? 'person' : 'people'}`;
}

/** Name, emoji and the audience line for a Circle being made or edited. */
export function CircleFields({ draft, autoFocus }: { draft: CircleDraft; autoFocus?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={draft.name}
        onChangeText={draft.setName}
        placeholder="Roommates, HS friends, climbing..."
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        maxLength={MAX_NAME}
        autoFocus={autoFocus}
        returnKeyType="done"
        accessibilityLabel="Circle name"
      />
      <Text style={styles.label}>Emoji</Text>
      <View style={styles.bleed}>
        <EmojiChips value={draft.emoji} onChange={draft.setEmoji} />
      </View>
      <View style={styles.effect} accessibilityLiveRegion="polite">
        <Icon name="eye" size={16} color={colors.tintText} />
        <Text style={styles.effectText}>{audienceEffect(draft.name, draft.members.length)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  label: { ...typeScale.label, color: colors.textSecondary, marginTop: spacing.sm },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    fontSize: 17,
    color: colors.text,
  },
  bleed: { marginHorizontal: -spacing.lg },
  effect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.tintBg,
  },
  effectText: { ...typeScale.label, color: colors.tintText, flexShrink: 1 },
});
