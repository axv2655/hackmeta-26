import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { StackScreen } from '@/components/common/StackScreen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { useMeUser } from '@/lib/people';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { colors, fontWeights, layout, radius, spacing, type as typeScale } from '@/lib/theme';

const MAX_NAME = 60;

function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter your name';
  if (trimmed.length > MAX_NAME) return `Use ${MAX_NAME} characters or fewer`;
  return null;
}

function VerifyRow({ verified }: { verified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (verified) {
    return (
      <View style={styles.verifiedRow}>
        <VerifiedBadge size={18} />
        <Text style={styles.verifiedText}>Verified with Facebook</Text>
      </View>
    );
  }
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await endpoints.me.verify();
      await useSession.getState().refreshMe();
      toast('Verified with Facebook');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.block}>
      <Text style={styles.label}>Verification</Text>
      <Text style={styles.help}>Friends see a blue check next to your name.</Text>
      <Button
        title={busy ? 'Verifying...' : 'Verify with Facebook'}
        onPress={verify}
        disabled={busy}
        style={styles.verify}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export default function EditProfileScreen() {
  const router = useRouter();
  const me = useMeUser();
  const [name, setName] = useState(me.name);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `me` can arrive after the screen opens (GET /me); fill the field until the user types.
  useEffect(() => {
    if (!touched) setName(me.name);
  }, [me.name, touched]);

  const problem = touched ? nameProblem(name) : null;
  const unchanged = name.trim() === me.name;

  const save = async () => {
    const issue = nameProblem(name);
    if (issue) {
      setTouched(true);
      setError(issue);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await endpoints.me.update(name.trim());
      await useSession.getState().refreshMe();
      toast('Profile updated');
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveButton = saving ? (
    <ActivityIndicator color={colors.blue} style={styles.saveSpinner} />
  ) : (
    <PressableScale
      onPress={save}
      disabled={unchanged}
      scaleTo={1}
      pressedOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel="Save"
      accessibilityState={{ disabled: unchanged }}
      hitSlop={10}
    >
      <Text style={[styles.save, unchanged && styles.saveDisabled]}>Save</Text>
    </PressableScale>
  );

  return (
    <StackScreen title="Edit profile" right={saveButton} scroll>
      <View style={styles.avatarRow}>
        <Avatar source={me.avatar} size={96} />
      </View>
      <View style={styles.block}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={name}
          onChangeText={(t) => {
            setTouched(true);
            setError(null);
            setName(t);
          }}
          maxLength={MAX_NAME + 10}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
          style={[styles.input, (problem || error) && styles.inputError]}
          accessibilityLabel="Name"
        />
        {problem || error ? <Text style={styles.error}>{problem ?? error}</Text> : null}
      </View>
      <VerifyRow verified={me.verified} />
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  avatarRow: { alignItems: 'center', paddingVertical: spacing.xl },
  block: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xl },
  label: { ...typeScale.row, fontWeight: fontWeights.semibold, marginBottom: spacing.xs },
  help: { ...typeScale.rowSub, marginBottom: spacing.md },
  input: {
    ...typeScale.row,
    height: layout.hitTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputError: { borderColor: colors.badgeRed },
  error: { ...typeScale.rowSub, color: colors.badgeRed, marginTop: spacing.xs },
  verify: { alignSelf: 'flex-start' },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter },
  verifiedText: { ...typeScale.row },
  save: { fontSize: 17, fontWeight: fontWeights.semibold, color: colors.blue, paddingHorizontal: spacing.sm },
  saveDisabled: { color: colors.textSecondary },
  saveSpinner: { paddingHorizontal: spacing.sm },
});
