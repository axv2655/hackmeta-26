import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { aspect, currentUser, type ImageRef } from '@/lib/mock';
import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';

import { audienceOption } from './audience';
import { AutoGrowTextInput } from './AutoGrowTextInput';
import { BackgroundSwatches } from './BackgroundSwatches';
import { canvasTextSize, getBackground, GRADIENT_END, GRADIENT_START } from './backgrounds';
import { ComposerActions, type ComposerActionId } from './ComposerActions';
import { hasContent, useComposerStore } from './draftStore';
import { PhotoPickerSheet } from './PhotoPickerSheet';

export type ComposeScreenProps = {
  /** The X at the left of the header. */
  onClose: () => void;
  /** The "Next" button; only reachable once the draft has text or a photo. */
  onNext: () => void;
};

/** Short plain posts are set large, like Facebook's composer; they drop to body size once they run long. */
const LARGE_TEXT_LIMIT = 84;
const CANVAS_MIN_HEIGHT = 260;
const AVATAR = 44;

/**
 * Whether the software keyboard is up. Starts true on native because the input
 * autofocuses, so the compact action bar is there from the first frame. Web has
 * no keyboard events and always reports false.
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener('keyboardWillShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

/** "Create post": who is posting, the text (optionally on a colored card), an attached photo, and the add-to-post actions. */
export function ComposeScreen({ onClose, onNext }: ComposeScreenProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const keyboardVisible = useKeyboardVisible();
  const [pickerOpen, setPickerOpen] = useState(false);

  const text = useComposerStore((s) => s.text);
  const image = useComposerStore((s) => s.image);
  const imageAspect = useComposerStore((s) => s.imageAspect);
  const backgroundId = useComposerStore((s) => s.backgroundId);
  const audience = useComposerStore((s) => s.audience);
  const setText = useComposerStore((s) => s.setText);
  const attachImage = useComposerStore((s) => s.attachImage);
  const removeImage = useComposerStore((s) => s.removeImage);
  const setBackground = useComposerStore((s) => s.setBackground);
  const cycleAudience = useComposerStore((s) => s.cycleAudience);

  const hasImage = image !== undefined;
  const background = hasImage ? undefined : getBackground(backgroundId);
  const canProceed = hasContent({ text, image });
  const audienceInfo = audienceOption(audience);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const handleAction = useCallback((id: ComposerActionId) => {
    // Tag people, Feeling/activity, Check in and Live video are stand-ins for now.
    if (id !== 'photo') return;
    Keyboard.dismiss();
    setPickerOpen(true);
  }, []);

  const handleSelectPhoto = useCallback(
    (photo: ImageRef, ratio: number) => {
      attachImage(photo, ratio);
      setPickerOpen(false);
    },
    [attachImage],
  );

  const handleCycleAudience = useCallback(() => {
    selection();
    cycleAudience();
  }, [cycleAudience]);

  const inputStyle = background
    ? [styles.input, styles.inputOnCanvas, canvasTextSize(text.length)]
    : [styles.input, !hasImage && text.length <= LARGE_TEXT_LIMIT ? styles.inputLarge : styles.inputRegular];

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Create post"
        variant="compact"
        backIcon="close"
        onBack={onClose}
        right={<Button title="Next" size="sm" onPress={onNext} disabled={!canProceed} />}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.userRow}>
            <Avatar source={currentUser.avatar} size={AVATAR} />
            <View style={styles.userText}>
              <Text style={styles.name} numberOfLines={1}>
                {currentUser.name}
              </Text>
              <PressableScale
                onPress={handleCycleAudience}
                hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                style={styles.audiencePill}
                accessibilityLabel={`Post audience: ${audienceInfo.label}`}
                accessibilityHint="Changes who can see this post"
              >
                <Icon name={audienceInfo.icon} size={14} color={colors.chipSelectedText} />
                <Text style={styles.audienceText}>{audienceInfo.label}</Text>
                <Icon name="chevron-down" size={14} color={colors.chipSelectedText} />
              </PressableScale>
            </View>
          </View>

          {/* Tapping anywhere in the writing area puts the caret in the input. The input
              keeps its place in the tree across modes, so switching never drops focus. */}
          <Pressable
            onPress={focusInput}
            accessible={false}
            style={[styles.canvas, background ? styles.canvasColored : !hasImage && styles.canvasFill]}
          >
            {background ? (
              <LinearGradient
                colors={background.colors}
                start={GRADIENT_START}
                end={GRADIENT_END}
                style={styles.fill}
              />
            ) : null}
            <AutoGrowTextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="What's on your mind?"
              placeholderTextColor={background ? colors.darkTextSecondary : colors.placeholder}
              selectionColor={background ? colors.white : colors.blue}
              autoFocus
              textAlignVertical="top"
              minHeight={background || hasImage ? 0 : 96}
              style={inputStyle}
              accessibilityLabel="Post text"
            />
          </Pressable>

          {hasImage ? (
            <View style={styles.photo}>
              <Image
                source={image}
                style={[styles.photoImage, { aspectRatio: imageAspect ?? aspect.post }]}
                contentFit="cover"
                transition={0}
                accessibilityLabel="Attached photo"
              />
              <IconButton
                name="close"
                size={16}
                color={colors.white}
                background
                backgroundColor={colors.scrim}
                backgroundSize={30}
                accessibilityLabel="Remove photo"
                onPress={removeImage}
                style={styles.removePhoto}
              />
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: keyboardVisible ? 0 : insets.bottom }]}>
          {hasImage ? null : <BackgroundSwatches selectedId={backgroundId} onSelect={setBackground} />}
          <ComposerActions
            variant={keyboardVisible ? 'bar' : 'list'}
            onAction={handleAction}
            photoAttached={hasImage}
          />
        </View>
      </KeyboardAvoidingView>

      <PhotoPickerSheet
        visible={pickerOpen}
        selected={image}
        onSelect={handleSelectPhoto}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  content: { flexGrow: 1, paddingBottom: spacing.md },

  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  userText: { flex: 1, alignItems: 'flex-start', gap: spacing.xs },
  name: { ...typeScale.row, fontWeight: fontWeights.semibold },
  // Capsule chip, the same light-blue fill as a selected filter chip.
  audiencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 28,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.pill,
    backgroundColor: colors.chipSelectedBg,
  },
  audienceText: { ...typeScale.label, fontSize: 14, lineHeight: 18, color: colors.chipSelectedText },

  canvas: { justifyContent: 'flex-start' },
  // Plain post without a photo: the writing area takes all the room that is left.
  canvasFill: { flexGrow: 1 },
  // Colored text card: an inset, rounded card rather than an edge-to-edge band.
  canvasColored: {
    minHeight: CANVAS_MIN_HEIGHT,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginTop: spacing.xs,
    marginHorizontal: layout.gutter,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    color: colors.text,
  },
  inputLarge: { fontSize: 24, lineHeight: 30 },
  inputRegular: { fontSize: typeScale.prompt.fontSize, lineHeight: typeScale.prompt.lineHeight },
  inputOnCanvas: {
    paddingHorizontal: spacing.xxl,
    color: colors.white,
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },

  photo: {
    marginHorizontal: layout.gutter,
    marginTop: spacing.sm,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photoImage: { width: '100%' },
  removePhoto: { position: 'absolute', top: spacing.xs, right: spacing.xs },

  bottom: { backgroundColor: colors.white },
});

export default ComposeScreen;
