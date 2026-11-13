import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/fb/ScreenHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import {
  audienceOf,
  loadComposer,
  notifyPeople,
  postMove,
  previewNotify,
  toMapMove,
  type ComposerData,
  type MoveInput,
  type NotifyPick,
  type Person,
  type PostedMove,
} from '@/lib/composer';
import { selection, success } from '@/lib/haptics';
import { shareMove } from '@/lib/invites';
import { currentUser } from '@/lib/mock';
import { useMyMoves } from '@/lib/store/moves';
import { colors, radius, spacing, type as typeScale } from '@/lib/theme';

/**
 * Make a Move (ARCHITECTURE.md 7.2), in two steps.
 *
 *   1. Compose: where you are, a short description, who it goes to (Facebook
 *      Groups / Circles and individual friends). "Make Move" posts it; nobody
 *      is notified yet.
 *   2. Send: Muse's picks for who to poke, with a reason each; "Poke" sends
 *      them. "Share" sends a no-login link from your own phone to people who
 *      aren't on Facebook.
 */
export default function NewMoveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ComposerData | null>(null);
  const [placeIndex, setPlaceIndex] = useState(0);
  const [text, setText] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ move: PostedMove; input: MoveInput } | null>(null);

  useEffect(() => {
    let live = true;
    loadComposer().then((d) => {
      if (!live) return;
      setData(d);
      setPlaceIndex(d.placeIndex);
      setText(d.text);
      setGroupIds(d.defaultGroupIds.filter((id) => d.groups.some((g) => g.id === id)));
    });
    return () => {
      live = false;
    };
  }, []);

  const audience = useMemo(() => (data ? audienceOf(data, groupIds, friendIds) : []), [data, groupIds, friendIds]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/moves'));

  if (posted) return <SendStep {...posted} onDone={close} />;

  const place = data?.places[placeIndex];
  const canPost = !!place && text.trim().length > 0 && audience.length > 0 && !posting;

  async function make() {
    if (!data || !place) return;
    setPosting(true);
    setError(null);
    const input: MoveInput = { place, text: text.trim(), groupIds, friendIds, audience };
    try {
      const move = await postMove(input, data.online);
      useMyMoves.getState().add(toMapMove(move));
      success();
      setPosted({ move, input });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't post your Move.");
    } finally {
      setPosting(false);
    }
  }

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.sm }]}>
      <ScreenHeader variant="compact" title="Make a Move" backIcon="close" onBack={close} />
      {!data ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <Text style={styles.label}>Where</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {data.places.map((p, i) => (
              <Chip
                key={p.id}
                label={i === data.placeIndex ? `${p.name} · here?` : p.name}
                icon="map-pin"
                on={i === placeIndex}
                onPress={() => setPlaceIndex(i)}
              />
            ))}
          </ScrollView>

          <Text style={styles.label}>What</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="What are you up to?"
            placeholderTextColor={colors.placeholder}
            maxLength={80}
            style={styles.input}
            returnKeyType="done"
            accessibilityLabel="Description"
          />
          <View style={styles.wrapRow}>
            {data.alternates.map((alt) => (
              <Chip key={alt} label={alt} small on={false} onPress={() => setText(alt)} />
            ))}
          </View>

          <Text style={styles.label}>Who</Text>
          <View style={styles.wrapRow}>
            {data.groups.map((g) => (
              <Chip
                key={g.id}
                label={g.groupName ?? g.name}
                tag={g.groupName ? 'Group' : undefined}
                icon="users"
                on={groupIds.includes(g.id)}
                onPress={() => setGroupIds((ids) => toggle(ids, g.id))}
              />
            ))}
          </View>
          <View style={styles.friendGrid}>
            {data.friends.map((f) => (
              <FriendToggle
                key={f.id}
                person={f}
                on={friendIds.includes(f.id)}
                onPress={() => setFriendIds((ids) => toggle(ids, f.id))}
              />
            ))}
          </View>

          <AudienceLine audience={audience} />
          {!data.online ? <Text style={styles.offline}>Offline: this Move stays on your phone.</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      )}
      <View style={styles.footer}>
        <Button title={posting ? 'Posting…' : 'Make Move'} icon="moves-filled" size="lg" fullWidth disabled={!canPost} onPress={make} />
      </View>
    </View>
  );
}

/** Step 2: notify the people Muse picked, and share with everyone else. */
function SendStep({ move, input, onDone }: { move: PostedMove; input: MoveInput; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [picks, setPicks] = useState<NotifyPick[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    previewNotify(move, input)
      .catch(() => [] as NotifyPick[])
      .then((p) => {
        setPicks(p);
        // Muse's picks plus anyone you chose by hand: you picked them for a reason.
        setChosen([...new Set([...p.map((x) => x.person.id), ...input.friendIds])]);
      });
  }, [move, input]);

  const reasonFor = useMemo(() => new Map((picks ?? []).map((p) => [p.person.id, p.reason])), [picks]);
  // Muse's picks first, then the rest of the audience (off by default).
  const rows = useMemo(() => {
    const picked = (picks ?? []).map((p) => p.person);
    return [...picked, ...input.audience.filter((a) => !picked.some((p) => p.id === a.id))];
  }, [picks, input.audience]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      setSent(await notifyPeople(move, chosen));
      success();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  function done() {
    useMyMoves.getState().focus(move.id);
    onDone();
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + spacing.sm }]}>
      <ScreenHeader variant="compact" title="Your Move is live" backIcon="close" onBack={done} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.liveCard}>
          <Icon name="check-circle" size={22} color={colors.online} />
          <View style={styles.flex}>
            <Text style={styles.liveTitle} numberOfLines={2}>
              “{move.text}”
            </Text>
            <Text style={styles.sub}>
              {move.place.name} · {input.audience.length} {input.audience.length === 1 ? 'person' : 'people'} can see it
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Poke them</Text>
        <Text style={styles.sub}>Muse picked who's most likely to pull up. Everyone else sees it on the map without a poke.</Text>
        {picks === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          rows.map((p) => {
            const on = chosen.includes(p.id);
            const done = sent?.some((s) => s.id === p.id);
            return (
              <PressableScale
                key={p.id}
                disabled={!!sent}
                onPress={() => {
                  selection();
                  setChosen((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]));
                }}
                style={styles.pickRow}
                scaleTo={0.98}
                accessibilityLabel={`${on ? 'Remove' : 'Add'} ${p.firstName}`}
              >
                <Face person={p} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.sub}>{done ? 'Poked' : reasonFor.get(p.id) ?? 'in your audience'}</Text>
                </View>
                <Icon
                  name={done ? 'check-circle' : on ? 'check-circle' : 'plus-circle'}
                  size={24}
                  color={done ? colors.online : on ? colors.blue : colors.textSecondary}
                />
              </PressableScale>
            );
          })
        )}
        {sent ? (
          <Text style={styles.sentNote}>
            {sent.length > 0 ? `Poked ${sent.map((p) => p.firstName).join(', ')}.` : 'Nobody new to poke.'}
          </Text>
        ) : (
          <Button
            title={sending ? 'Sending…' : chosen.length > 0 ? `Poke ${chosen.length}` : 'Pick someone to poke'}
            icon="bell"
            disabled={sending || chosen.length === 0 || picks === null}
            onPress={send}
          />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.shareCard}>
          <Text style={styles.label}>Friends not on Facebook?</Text>
          <Text style={styles.sub}>
            Send them a link from your own phone. It opens without signing in and stops working when your Move ends.
          </Text>
          <Button
            title="Share link"
            icon="share-external"
            variant="secondary"
            onPress={() =>
              shareMove({
                moveId: move.id,
                markName: move.place.name,
                creatorFirst: currentUser.firstName,
                inviterFirst: currentUser.firstName,
              })
            }
          />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button title="Done" size="lg" fullWidth variant={sent ? 'primary' : 'secondary'} onPress={done} />
      </View>
    </View>
  );
}

function Chip({
  label,
  on,
  onPress,
  icon,
  tag,
  small,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: 'map-pin' | 'users';
  tag?: string;
  small?: boolean;
}) {
  return (
    <PressableScale
      onPress={() => {
        selection();
        onPress();
      }}
      style={[styles.chip, small && styles.chipSmall, on && styles.chipOn]}
      scaleTo={0.95}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {icon ? <Icon name={icon} size={15} color={on ? colors.chipSelectedText : colors.textSecondary} /> : null}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
    </PressableScale>
  );
}

function FriendToggle({ person, on, onPress }: { person: Person; on: boolean; onPress: () => void }) {
  return (
    <PressableScale
      onPress={() => {
        selection();
        onPress();
      }}
      style={styles.friend}
      scaleTo={0.92}
      accessibilityLabel={`${on ? 'Remove' : 'Add'} ${person.firstName}`}
      accessibilityState={{ selected: on }}
    >
      <View style={[styles.friendRing, on && styles.friendRingOn]}>
        <Face person={person} size={52} />
        {on ? (
          <View style={styles.friendCheck}>
            <Icon name="check" size={12} color={colors.white} />
          </View>
        ) : null}
      </View>
      <Text style={styles.friendName} numberOfLines={1}>
        {person.firstName}
      </Text>
    </PressableScale>
  );
}

function Face({ person, size }: { person: Person; size: number }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (person.avatar) return <Image source={person.avatar} style={shape} contentFit="cover" />;
  return (
    <View style={[shape, styles.initial, { backgroundColor: person.color ?? colors.blue }]}>
      <Text style={styles.initialText}>{person.firstName.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** "Visible to 4 people: Maya, Dhivyesh, Tony and 1 more" (rule 1.5.4). */
function AudienceLine({ audience }: { audience: Person[] }) {
  if (audience.length === 0) return <Text style={styles.audience}>Pick a group or friends to share with.</Text>;
  const names = audience.map((p) => p.firstName);
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  return (
    <View style={styles.audienceRow}>
      <Icon name="lock" size={14} color={colors.textSecondary} />
      <Text style={styles.audience}>
        Visible to {audience.length} {audience.length === 1 ? 'person' : 'people'}: {shown}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.xl },
  body: { padding: spacing.lg, gap: spacing.md },
  label: { ...typeScale.sectionTitle, marginTop: spacing.sm },
  sub: { ...typeScale.rowSub },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  chipSmall: { height: 30, paddingHorizontal: 12 },
  chipOn: { backgroundColor: colors.chipSelectedBg },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.text, maxWidth: 220 },
  chipTextOn: { color: colors.chipSelectedText },
  tag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.white,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  input: {
    fontSize: 17,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  friendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  friend: { width: 64, alignItems: 'center', gap: 4 },
  friendRing: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: colors.transparent },
  friendRingOn: { borderColor: colors.blue },
  friendCheck: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendName: { fontSize: 13, color: colors.text, maxWidth: 64 },
  initial: { alignItems: 'center', justifyContent: 'center' },
  initialText: { color: colors.white, fontWeight: '700', fontSize: 18 },
  audienceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  audience: { ...typeScale.rowSub, flexShrink: 1 },
  offline: { ...typeScale.rowSub, fontSize: 13 },
  error: { color: colors.badgeRed, fontSize: 15 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  liveCard: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  liveTitle: { ...typeScale.name },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  name: { ...typeScale.name },
  sentNote: { ...typeScale.body, color: colors.online, fontWeight: '600' },
  shareCard: { gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface },
});
