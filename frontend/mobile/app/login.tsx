import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLogo } from '@/components/fb/brand/FLogo';
import { MetaLogo } from '@/components/fb/brand/MetaLogo';
import { PressableScale } from '@/components/ui/PressableScale';
import { errorMessage } from '@/lib/backend';
import { DEMO } from '@/lib/demo';
import { selection, success, warning } from '@/lib/haptics';
import { useSession } from '@/lib/session';
import { colors, radius, spacing } from '@/lib/theme';

type Mode = 'login' | 'signup';

/** Seeded demo people: username is the first name in lower case, password "moves". */
const DEMO_ACCOUNTS = ['Anish', 'Priya', 'Tony', 'Maya'] as const;
const DEMO_PASSWORD = 'moves';

/**
 * Log in or make an account. Shown whenever nobody is signed in on this
 * phone; the root layout swaps in the app once `userId` is set, and sends a
 * fresh sign-up to onboarding (this screen never navigates itself).
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const signup = mode === 'signup';
  const ready = username.trim().length > 0 && password.length > 0 && (!signup || name.trim().length > 0);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = useSession.getState();
      if (signup) await session.signUp(name, username, password);
      else await session.logIn(username, password);
      success();
    } catch (e) {
      warning();
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const fillDemo = (first: string) => {
    selection();
    setMode('login');
    setUsername(first.toLowerCase());
    setPassword(DEMO_PASSWORD);
    setError(null);
  };

  const flip = () => {
    setMode(signup ? 'login' : 'signup');
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <FLogo size={64} />
        </View>
        <Text style={styles.title}>{signup ? 'Make your account' : 'Log in to Facebook'}</Text>

        <View style={styles.fields}>
          {signup ? (
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.placeholder}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => usernameRef.current?.focus()}
              accessibilityLabel="Your name"
            />
          ) : null}
          <TextInput
            ref={usernameRef}
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={colors.placeholder}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={signup ? 'username-new' : 'username'}
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="Username"
          />
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={signup ? 'new-password' : 'current-password'}
            textContentType={signup ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submit}
            accessibilityLabel="Password"
          />
        </View>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <PressableScale
          onPress={submit}
          disabled={!ready || busy}
          scaleTo={0.97}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy }}
        >
          {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{signup ? 'Sign up' : 'Log in'}</Text>}
        </PressableScale>

        {DEMO ? (
          <View style={styles.demo}>
            <Text style={styles.demoLabel}>Demo accounts</Text>
            <View style={styles.demoRow}>
              {DEMO_ACCOUNTS.map((first) => (
                <PressableScale
                  key={first}
                  onPress={() => fillDemo(first)}
                  scaleTo={0.95}
                  style={[styles.demoChip, username === first.toLowerCase() && !signup && styles.demoChipOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Fill in ${first}'s demo account`}
                >
                  <Text style={styles.demoChipText}>{first}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.spacer} />

        <PressableScale onPress={flip} scaleTo={0.97} style={styles.secondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>{signup ? 'I already have an account' : 'Create new account'}</Text>
        </PressableScale>
        <View style={styles.meta}>
          <MetaLogo height={14} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg },
  logo: { alignItems: 'center', marginBottom: spacing.xxl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.xl },
  fields: { gap: spacing.md },
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.lg,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.white,
  },
  error: { color: colors.badgeRed, fontSize: 14, marginTop: spacing.md, textAlign: 'center' },
  primary: {
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  primaryText: { color: colors.white, fontSize: 17, fontWeight: '600' },
  demo: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.sm },
  demoLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  demoRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  demoChip: {
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoChipOn: { backgroundColor: colors.chipSelectedBg },
  demoChipText: { fontSize: 15, fontWeight: '600', color: colors.text },
  spacer: { flex: 1, minHeight: spacing.xxxl },
  secondary: {
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.blue, fontSize: 16, fontWeight: '600' },
  meta: { alignItems: 'center', marginTop: spacing.lg },
});
