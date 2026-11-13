import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { categoryMeta } from '@/lib/categories';
import { colors, radius, spacing } from '@/lib/theme';
import { CATEGORIES, type Category, type MuseSource } from '@/lib/types';

import { Chip, section } from './Chip';
import type { MuseState } from './useComposerForm';

type Props = {
  text: string;
  onText: (t: string, typed: boolean) => void;
  /** True once the user typed their own line (the Muse badge then goes away). */
  edited: boolean;
  alternates: string[];
  category: Category;
  onCategory: (c: Category) => void;
  muse: MuseState;
  source: MuseSource;
};

function museLine(muse: MuseState): string | null {
  if (muse === 'writing') return 'Muse is writing…';
  if (muse === 'failed') return "Muse couldn't write a draft, so this is the quick one";
  return null;
}

/** "What": the Move's line (Muse's draft, honestly labelled), one-tap alternates and the category. */
export function WhatField({ text, onText, edited, alternates, category, onCategory, muse, source }: Props) {
  const line = museLine(muse);
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={section.label}>What</Text>
        {edited ? null : <MuseBadge source={source} style={styles.badge} />}
      </View>
      <TextInput
        value={text}
        onChangeText={(t) => onText(t, true)}
        placeholder="What are you up to?"
        placeholderTextColor={colors.placeholder}
        maxLength={80}
        style={styles.input}
        returnKeyType="done"
        accessibilityLabel="What you're doing"
      />
      {line ? (
        <View style={styles.museRow}>
          {muse === 'writing' ? <ActivityIndicator size="small" /> : null}
          <Text style={section.meta}>{line}</Text>
        </View>
      ) : null}
      {alternates.length ? (
        <View style={section.wrapRow}>
          {alternates.map((alt) => (
            <Chip key={alt} label={alt} small on={alt === text} onPress={() => onText(alt, false)} />
          ))}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={section.chipRow}>
        {CATEGORIES.map((c) => {
          const meta = categoryMeta(c);
          return <Chip key={c} label={meta.label} icon={meta.icon} small on={c === category} onPress={() => onCategory(c)} />;
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { marginTop: spacing.sm },
  input: {
    fontSize: 17,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  museRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
