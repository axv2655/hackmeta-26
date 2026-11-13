import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { MomentImage } from '@/components/move/MomentImage';
import { useMoments } from '@/components/move/useMoments';
import { Button } from '@/components/ui/Button';
import type { MapMove } from '@/lib/mock/moves';
import { useSession } from '@/lib/session';
import { useSnapshots, type LocalSnapshot } from '@/lib/snapshots';
import { colors } from '@/lib/theme';

const NONE: LocalSnapshot[] = [];
const enc = encodeURIComponent;

type Props = { move: MapMove; id: string; sample: boolean; ghost: boolean };

/** True when the signed-in user is part of this live Move (posted it, or pulled up). */
function inMove(m: MapMove, ghost: boolean): boolean {
  if (ghost) return false;
  return Boolean(m.mine || m.going || m.myStatus === 'there' || m.myStatus === 'going');
}

/** The Move's snapshots in the card, newest first, with the shutter when you are in the Move. */
export function MoveSnapshots({ move, id, sample, ghost }: Props) {
  const router = useRouter();
  const myId = useSession((s) => s.userId);
  const local = useSnapshots((s) => s.byMove[id]) ?? NONE;
  const { items } = useMoments(id, !sample && id !== '');
  const canSnap = inMove(move, ghost);
  if (!canSnap && local.length === 0 && items.length === 0) return null;

  const openAll = sample ? undefined : () => router.push(`/move/${enc(id)}/moments`);
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>Snapshots</Text>
        {canSnap ? (
          <Button
            title="Snapshot"
            icon="camera"
            variant="secondary"
            size="sm"
            onPress={() => router.push(`/move/${enc(id)}/snap${sample ? '?sample=1' : ''}`)}
          />
        ) : null}
      </View>
      {local.length + items.length === 0 ? (
        <Text style={styles.empty}>Capture the moment. Everyone who can see this Move will see it here.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {local.map((s, i) => (
            <Polaroid key={s.uri} tilt={i} by="Me" note={s.state === 'sending' ? 'Sharing...' : s.state === 'failed' ? 'Not shared' : null}>
              <Image source={{ uri: s.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Polaroid>
          ))}
          {items.map((m, i) => (
            <Polaroid key={m.id} tilt={local.length + i} by={m.author.id === myId ? 'Me' : m.author.first_name} onPress={openAll}>
              <MomentImage moment={m} style={StyleSheet.absoluteFill} />
            </Polaroid>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

type PolaroidProps = { tilt: number; by: string; note?: string | null; onPress?: () => void; children: React.ReactNode };

function Polaroid({ tilt, by, note, onPress, children }: PolaroidProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.polaroid, { transform: [{ rotate: tilt % 2 ? '2deg' : '-2deg' }] }]}
      accessibilityLabel={`Snapshot by ${by}`}
    >
      <View style={styles.photo}>
        {children}
        {note ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.by} numberOfLines={1}>
        {by}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  empty: { fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  row: { gap: 12, paddingVertical: 6, paddingHorizontal: 2 },
  polaroid: {
    padding: 5,
    paddingBottom: 4,
    borderRadius: 6,
    backgroundColor: colors.white,
    shadowColor: '#0F1932',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  photo: { width: 104, height: 132, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.grayButton },
  note: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)' },
  noteText: { fontSize: 11, fontWeight: '600', color: colors.white },
  by: { marginTop: 4, fontSize: 12, fontWeight: '600', textAlign: 'center', color: colors.text, maxWidth: 104 },
});
