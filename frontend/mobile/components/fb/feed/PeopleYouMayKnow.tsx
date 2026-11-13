import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { useFriends } from '@/lib/friends';
import { toUser } from '@/lib/people';
import { colors, hairline, layout, radius, spacing, type as typeScale } from '@/lib/theme';
import type { Person, Relation } from '@/lib/types';

import { UnitHeader } from './UnitHeader';

export type PeopleYouMayKnowProps = {
  /** Defaults to "People you may know". */
  title?: string;
  /** Friend suggestions from GET /friends/suggestions. The unit renders nothing when empty. */
  people: Person[];
  /** X in the header, and also called once the last card has been removed. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

const CARD_WIDTH = 300;
const CARD_GAP = spacing.sm;
const PHOTO_HEIGHT = 240;
const PORTRAIT = 132;
const PORTRAIT_RING = 3;

type CardAction = { title: string; variant: 'primary' | 'tinted' | 'secondary'; icon?: 'friend-add' };

function actionFor(relation: Relation): CardAction {
  switch (relation) {
    case 'outgoing':
      return { title: 'Request sent', variant: 'tinted' };
    case 'incoming':
      return { title: 'Confirm', variant: 'primary' };
    case 'friend':
      return { title: 'Friends', variant: 'secondary' };
    default:
      return { title: 'Add friend', variant: 'primary', icon: 'friend-add' };
  }
}

function subtitle(person: Person): string {
  if (person.mutual_count > 0) {
    return `${person.mutual_count} mutual friend${person.mutual_count === 1 ? '' : 's'}`;
  }
  return person.username ? `@${person.username}` : 'Suggested for you';
}

type SuggestionCardProps = {
  person: Person;
  relation: Relation;
  onAction: (person: Person, relation: Relation) => void;
  onOpen: (person: Person) => void;
  onRemove: (id: string) => void;
};

function SuggestionCard({ person, relation, onAction, onOpen, onRemove }: SuggestionCardProps) {
  const avatar = toUser(person.user).avatar;
  const action = actionFor(relation);
  const name = person.user.name;

  return (
    <View style={styles.card}>
      {/*
        The bundled portraits are 128px squares, far too small to fill a 300pt
        card. A blurred copy fills the photo area and the portrait itself sits
        on top at a size it can hold.
      */}
      <PressableScale
        onPress={() => onOpen(person)}
        scaleTo={1}
        pressedOpacity={0.8}
        style={styles.photo}
        accessibilityRole="button"
        accessibilityLabel={`Open ${name}'s profile`}
      >
        <Image source={avatar} style={styles.backdrop} contentFit="cover" blurRadius={24} accessible={false} />
        <View style={styles.backdropTint} />
        <View style={styles.portraitRing}>
          <Image source={avatar} style={styles.portrait} contentFit="cover" accessible={false} />
        </View>
      </PressableScale>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.mutualRow}>
          <Text style={styles.mutual} numberOfLines={1}>
            {subtitle(person)}
          </Text>
        </View>
        <View style={styles.buttons}>
          <Button
            title={action.title}
            variant={action.variant}
            icon={action.icon}
            onPress={() => onAction(person, relation)}
            accessibilityLabel={
              relation === 'outgoing' ? `Cancel friend request to ${name}` : `${action.title}: ${name}`
            }
            style={styles.button}
          />
          <Button
            title="Remove"
            variant="secondary"
            onPress={() => onRemove(person.user.id)}
            accessibilityLabel={`Remove ${name} from suggestions`}
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
}

/** "People you may know": title row with X, then a horizontal strip of real friend suggestions. */
export function PeopleYouMayKnow({ title = 'People you may know', people, onDismiss, style }: PeopleYouMayKnowProps) {
  const router = useRouter();
  const [removed, setRemoved] = useState<readonly string[]>([]);
  // Subscribing to `relations` re-renders the cards when a request goes out or rolls back.
  useFriends((s) => s.relations);
  const relationOf = useFriends((s) => s.relationOf);
  const add = useFriends((s) => s.add);
  const confirm = useFriends((s) => s.confirm);
  const cancel = useFriends((s) => s.remove);

  const visible = people.filter((person) => !removed.includes(person.user.id));

  const act = useCallback(
    (person: Person, relation: Relation) => {
      if (relation === 'outgoing') void cancel(person.user.id);
      else if (relation === 'incoming') void confirm(person.user, person.username);
      else if (relation === 'friend') router.push(`/user/${encodeURIComponent(person.user.id)}`);
      else void add(person.user, person.username);
    },
    [add, cancel, confirm, router],
  );

  const open = useCallback(
    (person: Person) => router.push(`/user/${encodeURIComponent(person.user.id)}`),
    [router],
  );

  const remove = useCallback(
    (id: string) => {
      const remaining = visible.filter((person) => person.user.id !== id);
      setRemoved((ids) => [...ids, id]);
      // Nothing left to suggest: take the whole unit out of the feed.
      if (remaining.length === 0) onDismiss?.();
    },
    [onDismiss, visible],
  );

  if (visible.length === 0) return null;

  return (
    <View style={[styles.root, style]}>
      <UnitHeader title={title} onDismiss={onDismiss} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.strip}
      >
        {visible.map((person) => (
          <SuggestionCard
            key={person.user.id}
            person={person}
            relation={relationOf(person)}
            onAction={act}
            onOpen={open}
            onRemove={remove}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  strip: {
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.lg,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.white,
    ...hairline(),
  },
  photo: {
    height: PHOTO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.grayButton,
  },
  // Oversized so the blur's soft edge falls outside the clipped photo area.
  backdrop: {
    position: 'absolute',
    top: -40,
    right: -40,
    bottom: -40,
    left: -40,
  },
  backdropTint: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrimLight,
  },
  portraitRing: {
    width: PORTRAIT + PORTRAIT_RING * 2,
    height: PORTRAIT + PORTRAIT_RING * 2,
    borderRadius: (PORTRAIT + PORTRAIT_RING * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  portrait: {
    width: PORTRAIT,
    height: PORTRAIT,
    borderRadius: PORTRAIT / 2,
    backgroundColor: colors.grayButton,
  },
  info: { padding: spacing.md },
  name: { ...typeScale.sectionTitle, fontWeight: '700', letterSpacing: -0.3 },
  mutualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    minHeight: 20,
  },
  mutual: { ...typeScale.rowSub, flexShrink: 1 },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: { flex: 1 },
});

export default PeopleYouMayKnow;
