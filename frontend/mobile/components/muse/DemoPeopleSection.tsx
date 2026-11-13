import { useCallback, useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { UserLite } from '@/lib/types';

import { CastPicker } from './CastPicker';
import { DemoButton } from './DemoButton';
import { DemoSection } from './DemoSection';
import { FRIEND_MOVE_PRESETS, latestMoveOf, type FriendMovePreset } from './demoActions';

type Cast = { users: UserLite[]; loading: boolean; error: string | null };

const DEFAULT_PICK = 'u_tony';

/** Steps another person would do: post, pull up, arrive, leave, accept a request, be nearby. */
export function DemoPeopleSection() {
  const router = useRouter();
  const meId = useSession((s) => s.userId);
  const [cast, setCast] = useState<Cast>({ users: [], loading: true, error: null });
  const [pickedId, setPickedId] = useState<string | null>(null);

  const loadCast = useCallback(async () => {
    setCast((c) => ({ ...c, loading: true, error: null }));
    try {
      const users = (await endpoints.demo.users()).filter((u) => u.id !== meId);
      setCast({ users, loading: false, error: null });
      setPickedId((cur) => cur ?? (users.find((u) => u.id === DEFAULT_PICK) ?? users[0])?.id ?? null);
    } catch (e) {
      setCast((c) => ({ ...c, loading: false, error: errorMessage(e) }));
    }
  }, [meId]);

  useEffect(() => {
    void loadCast();
  }, [loadCast]);

  const picked = cast.users.find((u) => u.id === pickedId) ?? null;
  const name = picked?.first_name ?? 'Friend';
  const need = (): UserLite => {
    if (!picked) throw new Error('Pick someone first');
    return picked;
  };

  const postMove = async (p: FriendMovePreset) => {
    const res = await endpoints.demo.friendMove({
      user_id: need().id,
      mark_id: p.markId,
      text: p.text,
      category: p.category,
      notify_me: true,
    });
    appEvents.emit('moves.changed');
    toast(`${name} posted a Move at ${p.place}`, {
      label: 'Open',
      onPress: () => router.push(`/move/${encodeURIComponent(res.move_id)}` as Href),
    });
  };

  const join = async (status: 'going' | 'there') => {
    const move = await latestMoveOf(meId);
    await endpoints.demo.friendJoin({ user_id: need().id, move_id: move.id, status });
    appEvents.emit('moves.changed');
    return status === 'there' ? `${name} is there` : `${name} pulled up to your Move`;
  };

  const leave = async (quiet: boolean) => {
    const move = await latestMoveOf(meId);
    await endpoints.demo.friendLeave({ user_id: need().id, move_id: move.id, quiet });
    appEvents.emit('moves.changed');
    return quiet ? `${name} left quietly` : `${name} left your Move`;
  };

  const accept = async () => {
    const res = await endpoints.demo.friendAccept(need().id);
    return res.relation === 'friend' ? `${name} accepted your friend request` : `${name}: ${res.relation}`;
  };

  const together = async (on: boolean) => {
    const res = await endpoints.demo.copresence([meId, need().id], on);
    appEvents.emit('moves.changed');
    if (!on) return `You and ${name} are apart`;
    const extra = [
      res.prompted.length ? `${res.prompted.length} prompted` : '',
      res.auto_joined.length ? `${res.auto_joined.length} auto-joined` : '',
    ].filter(Boolean);
    return `You and ${name} are together${extra.length ? ` · ${extra.join(', ')}` : ''}`;
  };

  const off = !picked;
  return (
    <DemoSection title="People" note="Pick who acts. 'Your Move' means your newest live Move.">
      <CastPicker
        users={cast.users}
        loading={cast.loading}
        error={cast.error}
        pickedId={pickedId}
        onPick={setPickedId}
        onRetry={() => void loadCast()}
      />
      {FRIEND_MOVE_PRESETS.map((p) => (
        <DemoButton
          key={p.markId}
          label={`${name} posts a Move at ${p.place}`}
          sub={`"${p.text}" · you get notified`}
          icon="map-pin"
          disabled={off}
          run={() => postMove(p)}
        />
      ))}
      <DemoButton label={`${name} pulls up to your Move`} icon="user-plus" disabled={off} run={() => join('going')} />
      <DemoButton label={`${name} arrives`} icon="check-circle" disabled={off} run={() => join('there')} />
      <DemoButton
        label={`${name} leaves your Move`}
        sub="Leaves a Ghost"
        icon="logout"
        disabled={off}
        run={() => leave(false)}
      />
      <DemoButton
        label={`${name} leaves quietly`}
        sub="No Ghost"
        icon="eye-off"
        disabled={off}
        run={() => leave(true)}
      />
      <DemoButton label={`${name} accepts your friend request`} icon="user-check" disabled={off} run={accept} />
      <DemoButton
        label="Put us together"
        sub="Simulated Bluetooth: we're in the same place"
        icon="users"
        disabled={off}
        run={() => together(true)}
      />
      <DemoButton label="Split us up" icon="x-circle" disabled={off} run={() => together(false)} />
    </DemoSection>
  );
}

export default DemoPeopleSection;
