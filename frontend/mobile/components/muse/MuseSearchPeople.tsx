import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ReasonLine } from '@/components/common/ReasonLine';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { selection } from '@/lib/haptics';
import { useMuseSearch } from '@/lib/museSearch';
import { toUser } from '@/lib/people';
import { colors } from '@/lib/theme';
import type { MuseSearchPerson, MuseSource } from '@/lib/types';

import { searchStyles } from './searchStyles';

const avatarOf = (p: MuseSearchPerson) =>
  toUser({
    id: p.user_id,
    name: p.name,
    first_name: p.first_name,
    avatar_url: p.avatar_url,
    avatar_color: p.avatar_color,
    fb_verified: false,
  }).avatar;

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

type Props = { people: MuseSearchPerson[]; source: MuseSource };

/** Friends Muse ranked for this; all picked by default. "Draft Move to them" makes a held draft. */
export function MuseSearchPeople({ people, source }: Props) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(people.map((p) => p.user_id)));

  if (people.length === 0) {
    return (
      <View style={searchStyles.card}>
        <Text style={searchStyles.meta}>Muse didn’t find anyone for that yet.</Text>
      </View>
    );
  }

  const toggle = (id: string) => {
    selection();
    setPicked((s) => toggled(s, id));
  };
  const ids = people.map((p) => p.user_id).filter((id) => picked.has(id));

  return (
    <View style={searchStyles.card}>
      <View style={searchStyles.group}>
        {people.map((p, i) => (
          <PersonRow key={p.user_id} person={p} on={picked.has(p.user_id)} first={i === 0} source={source} onPress={toggle} />
        ))}
      </View>
      <Button
        title={ids.length ? 'Draft Move to them' : 'Pick someone'}
        size="sm"
        icon="sparkles"
        disabled={ids.length === 0}
        onPress={() => void useMuseSearch.getState().draftFrom({ user_ids: ids })}
      />
    </View>
  );
}

type RowProps = {
  person: MuseSearchPerson;
  on: boolean;
  first: boolean;
  source: MuseSource;
  onPress: (id: string) => void;
};

function PersonRow({ person, on, first, source, onPress }: RowProps) {
  return (
    <PressableScale
      onPress={() => onPress(person.user_id)}
      scaleTo={1}
      style={[searchStyles.row, !first && searchStyles.rowDivider]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={person.name}
    >
      <Avatar source={avatarOf(person)} size={40} />
      <View style={searchStyles.rowText}>
        <Text style={searchStyles.name} numberOfLines={1}>
          {person.name}
        </Text>
        {person.reason ? <ReasonLine text={person.reason} source={source} /> : null}
      </View>
      <View style={[styles.check, on && styles.checkOn]}>
        {on ? <Icon name="check" size={14} color={colors.white} strokeWidth={3} /> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.blue, borderColor: colors.blue },
});

export default MuseSearchPeople;
