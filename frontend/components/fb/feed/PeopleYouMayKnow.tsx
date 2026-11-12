import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { friends, suggestions as mockSuggestions, type User } from '@/lib/mock';
import { colors, hairline, layout, radii, spacing, type as typeScale } from '@/lib/theme';

import { UnitHeader } from './UnitHeader';

export type PeopleYouMayKnowProps = {
  /** Defaults to "People you may know". */
  title?: string;
  /** Defaults to the seeded suggestions. */
  people?: User[];
  onPressMore?: () => void;
  /** X in the header, and also called once the last card has been removed. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

const CARD_WIDTH = 300;
const CARD_GAP = spacing.sm;
const PHOTO_HEIGHT = 240;
const PORTRAIT = 132;
const PORTRAIT_RING = 3;

type SuggestionCardProps = {
  person: User;
  requested: boolean;
  onToggleRequest: (id: string) => void;
  onRemove: (id: string) => void;
};

function SuggestionCard({ person, requested, onToggleRequest, onRemove }: SuggestionCardProps) {
  // Two friends stand in for the "mutual friends" faces.
  const faces = friends.slice(0, 2);

  return (
    <View style={styles.card}>
      {/*
        The bundled portraits are 128px squares, far too small to fill a 300pt
        card. A blurred copy fills the photo area and the portrait itself sits
        on top at a size it can hold.
      */}
      <View style={styles.photo}>
        <Image
          source={person.avatar}
          style={styles.backdrop}
          contentFit="cover"
          blurRadius={24}
          accessible={false}
        />
        <View style={styles.backdropTint} />
        <View style={styles.portraitRing}>
          <Image
            source={person.avatar}
            style={styles.portrait}
            contentFit="cover"
            accessibilityLabel={person.name}
          />
        </View>
      </View>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {person.name}
        </Text>
        <View style={styles.mutualRow}>
          {person.mutualFriends > 0 ? (
            <View style={styles.faces}>
              {faces.map((friend, i) => (
                <Avatar
                  key={friend.id}
                  source={friend.avatar}
                  size={18}
                  style={[styles.face, i > 0 && styles.faceOverlap]}
                />
              ))}
            </View>
          ) : null}
          <Text style={styles.mutual} numberOfLines={1}>
            {person.mutualFriends > 0
              ? `${person.mutualFriends} mutual friend${person.mutualFriends === 1 ? '' : 's'}`
              : person.subtitle}
          </Text>
        </View>
        <View style={styles.buttons}>
          <Button
            title={requested ? 'Request sent' : 'Add friend'}
            variant={requested ? 'tinted' : 'primary'}
            // "Request sent" only fits the half-width button without a leading icon.
            icon={requested ? undefined : 'friend-add'}
            onPress={() => onToggleRequest(person.id)}
            accessibilityLabel={
              requested ? `Cancel friend request to ${person.name}` : `Add ${person.name} as a friend`
            }
            style={styles.button}
          />
          <Button
            title="Remove"
            variant="secondary"
            onPress={() => onRemove(person.id)}
            accessibilityLabel={`Remove ${person.name} from suggestions`}
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
}

/** "People you may know": title row with "..." and X, then a horizontal strip of suggestion cards. */
export function PeopleYouMayKnow({
  title = 'People you may know',
  people = mockSuggestions,
  onPressMore,
  onDismiss,
  style,
}: PeopleYouMayKnowProps) {
  const [requested, setRequested] = useState<readonly string[]>([]);
  const [removed, setRemoved] = useState<readonly string[]>([]);

  const visible = people.filter((person) => !removed.includes(person.id));

  const toggleRequest = useCallback((id: string) => {
    setRequested((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]));
  }, []);

  const remove = useCallback(
    (id: string) => {
      const remaining = people.filter((person) => person.id !== id && !removed.includes(person.id));
      setRemoved((ids) => [...ids, id]);
      // Nothing left to suggest: take the whole unit out of the feed.
      if (remaining.length === 0) onDismiss?.();
    },
    [onDismiss, people, removed],
  );

  if (visible.length === 0) return null;

  return (
    <View style={[styles.root, style]}>
      <UnitHeader title={title} onPressMore={onPressMore} onDismiss={onDismiss} />
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
            key={person.id}
            person={person}
            requested={requested.includes(person.id)}
            onToggleRequest={toggleRequest}
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
    paddingBottom: spacing.md,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: radii.md,
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
  name: { ...typeScale.sectionTitle },
  mutualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    minHeight: 20,
  },
  faces: { flexDirection: 'row', marginRight: 6 },
  face: { borderRadius: 9 },
  faceOverlap: { marginLeft: -5 },
  mutual: { ...typeScale.rowSub, flexShrink: 1 },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  button: { flex: 1 },
});

export default PeopleYouMayKnow;
