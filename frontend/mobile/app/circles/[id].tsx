import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CircleFields } from '@/components/circles/CircleFields';
import { MemberPicker } from '@/components/circles/MemberPicker';
import { useCircleDraft } from '@/components/circles/useCircleDraft';
import { useFriendList } from '@/components/circles/useFriendList';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { StackScreen } from '@/components/common/StackScreen';
import { Button } from '@/components/ui/Button';
import { useCircles } from '@/lib/circles';
import { success } from '@/lib/haptics';
import { colors, spacing, type as typeScale } from '@/lib/theme';

/** Make a Circle (`/circles/new`) or edit one: name, emoji, members, delete. */
export default function CircleEditScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ?? 'new';
  const isNew = id === 'new';
  const circle = useCircles((s) => (isNew ? undefined : s.items.find((c) => c.id === id)));
  const status = useCircles((s) => s.status);
  const error = useCircles((s) => s.error);
  const load = useCircles((s) => s.load);
  const draft = useCircleDraft(circle);
  const friends = useFriendList();
  const [saving, setSaving] = useState(false);
  const filled = useRef(isNew);

  useEffect(() => {
    if (!isNew && useCircles.getState().status !== 'ready') void load();
  }, [isNew, load]);

  // The Circle arrives after the first render when the list was not loaded yet.
  const { reset } = draft;
  useEffect(() => {
    if (circle && !filled.current) {
      filled.current = true;
      reset(circle);
    }
  }, [circle, reset]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/circles'));

  const save = async () => {
    if (!draft.valid || saving) return;
    setSaving(true);
    const store = useCircles.getState();
    const saved = isNew ? await store.create(draft.input(), draft.members) : await store.update(id, draft.input(), draft.members);
    setSaving(false);
    if (saved) {
      success();
      close();
    }
  };

  const confirmDelete = () =>
    Alert.alert(`Delete ${draft.name.trim() || 'this Circle'}?`, 'Live Moves you already shared keep their audience.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (await useCircles.getState().remove(id)) close();
        },
      },
    ]);

  const title = isNew ? 'New Circle' : 'Edit Circle';

  if (!isNew && !circle) {
    const body =
      status === 'error' ? (
        <ErrorState message={error ?? 'Could not load this Circle'} onRetry={load} />
      ) : status === 'ready' ? (
        <EmptyState icon="users" title="This Circle is gone" body="It may have been deleted." action={{ label: 'Back to Circles', onPress: () => router.replace('/circles') }} />
      ) : (
        <LoadingState label="Loading Circle" />
      );
    return <StackScreen title={title}>{body}</StackScreen>;
  }

  return (
    <StackScreen title={title} scroll>
      <CircleFields draft={draft} autoFocus={isNew} />
      <Text style={styles.section}>Members</Text>
      <MemberPicker list={friends} selected={draft.selected} onToggle={draft.toggle} onFindFriends={() => router.push('/search')} />
      <View style={styles.actions}>
        <Button
          title={saving ? 'Saving...' : isNew ? 'Create Circle' : 'Save'}
          size="lg"
          onPress={save}
          disabled={!draft.valid || saving}
          fullWidth
        />
        {!isNew ? <Button title="Delete Circle" icon="trash" variant="secondary" onPress={confirmDelete} fullWidth /> : null}
      </View>
    </StackScreen>
  );
}

const styles = StyleSheet.create({
  section: { ...typeScale.sectionTitle, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm, color: colors.text },
  actions: { padding: spacing.lg, gap: spacing.md },
});
