import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { api as backend, type GlassesDraft } from '@/lib/backend';
import { success, warning } from '@/lib/haptics';
import { coarse, useLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { colors, layout, radius, spacing, type as typeScale } from '@/lib/theme';

/**
 * "Hey Meta, start a Move" (ARCHITECTURE.md 11.4). Tap Talk, say "start a Move, getting boba";
 * the server answers with a draft and a spoken line; say "confirm" (or tap) to post.
 *
 * Audio: the phone's mic, or Ray-Ban Meta glasses paired as a Bluetooth headset (iOS routes the
 * glasses mic in when the session allows Bluetooth). The real "Hey Meta" wake word belongs to
 * Meta AI and cannot be hooked, so a button starts listening and the typed canned command is the
 * demo fallback when there is no mic or no permission.
 */

type Phase = 'idle' | 'listening' | 'thinking' | 'draft' | 'posting' | 'posted' | 'error';
type Listening = 'command' | 'confirm';

const CANNED = 'Start a Move, getting boba';
const CONFIRM_WORD = /\bconfirm(ed)?\b/i;
const LANG = 'en-US';

export default function GlassesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useSession((s) => s.userId);
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<GlassesDraft | null>(null);
  const [message, setMessage] = useState('');
  const mode = useRef<Listening>('command');
  const heard = useRef('');
  const draftRef = useRef<GlassesDraft | null>(null);
  const busy = useRef(false);

  const say = useCallback((line: string, onDone?: () => void) => {
    Speech.stop();
    Speech.speak(line, { language: LANG, onDone, onStopped: onDone, onError: onDone });
  }, []);

  const fail = useCallback(
    (text: string) => {
      warning();
      setPhase('error');
      setMessage(text);
      say(text);
    },
    [say],
  );

  const confirm = useCallback(async () => {
    const pending = draftRef.current;
    if (busy.current || !pending) return;
    busy.current = true;
    setPhase('posting');
    try {
      const posted = await backend.glassesConfirm(userId, pending.draft_id);
      success();
      setPhase('posted');
      setMessage(posted.spoken);
      say(posted.spoken);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not post that Move.');
    } finally {
      busy.current = false;
    }
  }, [fail, say, userId]);

  const listen = useCallback(
    (what: Listening) => {
      mode.current = what;
      heard.current = '';
      try {
        ExpoSpeechRecognitionModule.start({
          lang: LANG,
          interimResults: true,
          continuous: false,
          // Glasses connect as a Bluetooth headset: let the session route their mic.
          iosCategory: { category: 'playAndRecord', categoryOptions: ['allowBluetooth', 'defaultToSpeaker'], mode: 'default' },
        });
        setPhase((p) => (what === 'command' ? 'listening' : p));
      } catch {
        fail('I could not start listening. Use the typed command below.');
      }
    },
    [fail],
  );

  const sendCommand = useCallback(
    async (utterance: string) => {
      const said = utterance.trim();
      if (!said || busy.current) return;
      busy.current = true;
      setPhase('thinking');
      setMessage('');
      try {
        // Location is opt-in: with it denied the draft simply has no place. Coarse only.
        const { coords, permission } = useLocation.getState();
        const near = permission === 'granted' && coords ? coarse(coords) : null;
        const result = await backend.glassesCommand(userId, {
          utterance: said,
          ...(near ? { lat: near.latitude, lng: near.longitude } : {}),
        });
        draftRef.current = result.draft_id ? result : null;
        setDraft(result.draft_id ? result : null);
        setMessage(result.spoken);
        if (!result.understood || result.needs_place) {
          // Not a Move command, or no place: nothing is held. Speak the line and let them say it again.
          setPhase('idle');
          say(result.spoken);
          return;
        }
        setPhase('draft');
        busy.current = false;
        // After the line is spoken, listen for "confirm" so the phone can stay in the pocket.
        say(result.spoken, () => listen('confirm'));
      } catch (e) {
        fail(e instanceof Error ? e.message : 'I could not reach Moves. Try again.');
      } finally {
        busy.current = false;
      }
    },
    [fail, listen, say, userId],
  );

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    heard.current = text;
    if (mode.current === 'command') setTranscript(text);
    if (mode.current === 'confirm' && CONFIRM_WORD.test(text)) {
      ExpoSpeechRecognitionModule.abort();
      void confirm();
    }
  });

  useSpeechRecognitionEvent('end', () => {
    if (mode.current === 'command' && heard.current) void sendCommand(heard.current);
    else if (mode.current === 'command') setPhase((p) => (p === 'listening' ? 'idle' : p));
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return;
    if (mode.current === 'confirm' && event.error === 'no-speech') return; // tap still works
    fail(
      event.error === 'not-allowed'
        ? 'Microphone or speech access is off. Use the typed command below.'
        : 'I did not catch that. Try again.',
    );
  });

  const talk = useCallback(async () => {
    if (phase === 'listening') {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    Speech.stop();
    ExpoSpeechRecognitionModule.abort();
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      fail('Microphone or speech access is off. Use the typed command below.');
      return;
    }
    void useLocation.getState().start(); // asked in context; the flow works if denied
    draftRef.current = null;
    setDraft(null);
    setTranscript('');
    setMessage('');
    listen('command');
  }, [fail, listen, phase]);

  useEffect(
    () => () => {
      Speech.stop();
      ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const listening = phase === 'listening';
  const working = phase === 'thinking' || phase === 'posting';

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Hey Meta"
        showMenu={false}
        left={<IconButton name="chevron-left" size={28} accessibilityLabel="Back" onPress={goBack} style={styles.back} />}
        backgroundColor={colors.surface}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Text style={styles.hint}>Say “start a Move, getting boba”. Nothing posts until you confirm.</Text>

        <View style={styles.talkWrap}>
          <View style={[styles.talk, listening && styles.talkOn]}>
            <Icon name="mic" size={44} color={colors.white} />
          </View>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {STATUS[phase]}
          </Text>
        </View>

        <Button
          title={listening ? 'Done talking' : 'Talk'}
          icon="mic"
          size="lg"
          disabled={working}
          onPress={() => void talk()}
          accessibilityLabel={listening ? 'Stop listening' : 'Start listening'}
        />

        {transcript !== '' && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>You said</Text>
            <Text style={styles.transcript}>{transcript}</Text>
          </View>
        )}

        {draft?.understood && draft.text && !draft.needs_place && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Draft Move</Text>
            <Text style={styles.cardTitle}>{draft.text}</Text>
            <Text style={styles.cardSub}>{draft.place ? `at ${draft.place}${draft.place_source === 'usual' ? ' (your usual spot)' : draft.place_source === 'new' ? ' (a new spot here)' : ''}` : ''}</Text>
            <Text style={styles.cardSub}>Say “confirm” or tap below. Expires in 5 minutes.</Text>
            <Button
              title={phase === 'posted' ? 'Posted' : 'Confirm'}
              size="lg"
              disabled={phase !== 'draft' && phase !== 'error'}
              onPress={() => void confirm()}
              style={styles.confirm}
            />
          </View>
        )}

        {message !== '' && phase !== 'draft' && <Text style={[styles.message, phase === 'error' && styles.error]}>{message}</Text>}

        <Button
          title={`Type it: “${CANNED}”`}
          variant="secondary"
          size="md"
          disabled={working || listening}
          onPress={() => {
            setTranscript(CANNED);
            void sendCommand(CANNED);
          }}
          style={styles.typed}
        />
      </ScrollView>
    </View>
  );
}

const STATUS: Record<Phase, string> = {
  idle: 'Tap Talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  draft: 'Say “confirm” to post',
  posting: 'Posting…',
  posted: 'Posted',
  error: 'Try again',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  back: { marginLeft: -spacing.sm },
  content: { paddingHorizontal: layout.gutter, paddingTop: spacing.md, gap: spacing.lg },
  hint: { ...typeScale.rowSub, textAlign: 'center' },
  talkWrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  talk: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkOn: { backgroundColor: colors.badgeRed },
  status: { ...typeScale.sectionTitle },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  cardLabel: { ...typeScale.caps, textTransform: 'uppercase' },
  transcript: { ...typeScale.body },
  cardTitle: { ...typeScale.eventTitle },
  cardSub: { ...typeScale.rowSub },
  confirm: { marginTop: spacing.md },
  message: { ...typeScale.rowSub, textAlign: 'center' },
  error: { color: colors.badgeRed },
  typed: { alignSelf: 'center' },
});
