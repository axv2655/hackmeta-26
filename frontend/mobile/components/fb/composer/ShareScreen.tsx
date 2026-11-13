import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { selection, success } from '@/lib/haptics';
import { useMeUser } from '@/lib/people';
import { useFeedStore } from '@/lib/store/feed';
import { colors, hairline, layout, radius, spacing, type as typeScale } from '@/lib/theme';

import { audienceOption } from './audience';
import { defaultTrack, hasContent, toPostDraft, useComposerStore } from './draftStore';
import { PostPreviewCard } from './PostPreviewCard';
import { SettingRow } from './SettingRow';
import { ToggleSwitch } from './ToggleSwitch';

export type ShareScreenProps = {
  /** Leading chevron. Default: `router.back()`, or Home when there is no history. */
  onBack?: () => void;
};

/**
 * "New post" share settings: preview card, audience, music,
 * AI label, and the Post button pinned to the bottom.
 */
export function ShareScreen({ onBack }: ShareScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const text = useComposerStore((s) => s.text);
  const image = useComposerStore((s) => s.image);
  const backgroundId = useComposerStore((s) => s.backgroundId);
  const audience = useComposerStore((s) => s.audience);
  const music = useComposerStore((s) => s.music);
  const aiLabel = useComposerStore((s) => s.aiLabel);
  const cycleAudience = useComposerStore((s) => s.cycleAudience);
  const setMusic = useComposerStore((s) => s.setMusic);
  const setAiLabel = useComposerStore((s) => s.setAiLabel);
  const addPost = useFeedStore((s) => s.addPost);
  const me = useMeUser();

  const canPost = hasContent({ text, image });
  const audienceInfo = audienceOption(audience);
  const posted = useRef(false);

  // Once posted, the draft is spent: clear it when this screen goes away (not
  // before, so the preview does not blank out while the screen animates off).
  useEffect(
    () => () => {
      if (posted.current) useComposerStore.getState().reset();
    },
    [],
  );

  const handlePost = useCallback(() => {
    if (posted.current) return;
    const draft = useComposerStore.getState();
    if (!hasContent(draft)) return;
    posted.current = true;
    addPost(toPostDraft(draft), me);
    success();
    // Pops everything above the tabs and lands on Home, where the new post is first in the feed.
    router.dismissTo('/');
  }, [addPost, me, router]);

  const handleCycleAudience = useCallback(() => {
    selection();
    cycleAudience();
  }, [cycleAudience]);

  return (
    <View style={styles.root}>
      <ScreenHeader title="New post" variant="compact" onBack={onBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.previewWrap}>
          <PostPreviewCard text={text} image={image} backgroundId={backgroundId} />
        </View>

        <View style={styles.rows}>
          <SettingRow
            icon={audienceInfo.icon}
            title="Post audience"
            onPress={handleCycleAudience}
            accessibilityLabel={`Post audience, ${audienceInfo.label}`}
            accessibilityHint="Changes who can see this post"
            trailing={
              <View style={styles.audienceChip}>
                <Text style={styles.audienceChipText} numberOfLines={1}>
                  {audienceInfo.label}
                </Text>
                <Icon name="chevron-down" size={14} color={colors.chipSelectedText} />
              </View>
            }
          />

          {music ? (
            <SettingRow
              icon="music"
              title={music.title}
              subtitle={music.artist}
              trailing={
                <IconButton
                  name="x-circle"
                  size={26}
                  color={colors.textSecondary}
                  accessibilityLabel={`Remove ${music.title}`}
                  onPress={() => setMusic(null)}
                  style={styles.trailingButton}
                />
              }
            />
          ) : (
            <SettingRow icon="music" title="Add music" onPress={() => setMusic(defaultTrack)} />
          )}

          <SettingRow
            icon="plus-circle"
            title="Add AI label"
            border={false}
            trailing={<ToggleSwitch value={aiLabel} onValueChange={setAiLabel} accessibilityLabel="Add AI label" />}
          >
            <Text style={styles.helper}>
              We require you to label certain realistic content that’s made with AI.
            </Text>
          </SettingRow>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button title="Post" size="lg" onPress={handlePost} disabled={!canPost} haptic={false} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.sm },
  previewWrap: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  rows: { ...hairline('Top') },
  trailingButton: { marginRight: -spacing.sm },
  helper: {
    ...typeScale.meta,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.lg,
  },
  // Capsule chip showing the current audience, like a selected filter chip.
  audienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 32,
    maxWidth: 180,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.chipSelectedBg,
  },
  audienceChipText: { ...typeScale.button, color: colors.chipSelectedText, flexShrink: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.white,
  },
});

export default ShareScreen;
