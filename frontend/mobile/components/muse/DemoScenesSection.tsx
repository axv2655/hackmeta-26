import { useRouter, type Href } from 'expo-router';

import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { useSession } from '@/lib/session';
import type { UserLite } from '@/lib/types';

import { DemoButton } from './DemoButton';
import { DemoSection } from './DemoSection';
import { FRIEND_MOVE_PRESETS, latestMoveOf } from './demoActions';
import { pickCast, sleep, useDemoCast } from './useDemoCast';

/** The seeded crew scenes use first; anyone else on the server fills in. */
const CREW = ['u_tony', 'u_maya', 'u_dev'];
/** Gap between steps, so each notification lands on its own. */
const BEAT_MS = 2500;

const changed = () => appEvents.emit('moves.changed');

function crewOf(users: UserLite[], n: number): UserLite[] {
  const crew = pickCast(users, CREW, n);
  if (!crew.length) throw new Error('No one else on this server yet');
  return crew;
}

const names = (crew: UserLite[]) => crew.map((u) => u.first_name).join(', ');

/**
 * Whole demo beats in one tap, built from the single triggers below them.
 * Each step goes through the real path, so the banners and pushes arrive
 * one after another like they would live.
 */
export function DemoScenesSection() {
  const router = useRouter();
  const meId = useSession((s) => s.userId);
  const cast = useDemoCast();

  const fillMyMove = async () => {
    const move = await latestMoveOf(meId);
    const crew = crewOf(cast.users, 3);
    for (const [i, u] of crew.entries()) {
      if (i) await sleep(BEAT_MS);
      await endpoints.demo.friendJoin({ user_id: u.id, move_id: move.id, status: 'going' });
      changed();
    }
    await sleep(BEAT_MS);
    await endpoints.demo.friendJoin({ user_id: crew[0].id, move_id: move.id, status: 'there' });
    changed();
    return `${names(crew)} pulled up · ${crew[0].first_name} is there`;
  };

  const friendNearby = async () => {
    const [friend] = crewOf(cast.users, 1);
    const preset = FRIEND_MOVE_PRESETS[0];
    await endpoints.demo.friendMove({
      user_id: friend.id,
      mark_id: preset.markId,
      text: preset.text,
      category: preset.category,
      notify_me: false,
    });
    changed();
    await sleep(BEAT_MS);
    const res = await endpoints.demo.copresence([meId, friend.id], true);
    changed();
    if (res.auto_joined.length) return `You're with ${friend.first_name} · auto-joined`;
    return `You're with ${friend.first_name} at ${preset.place}`;
  };

  const afterTheMove = async () => {
    const move = await latestMoveOf(meId);
    const crew = crewOf(cast.users, 2);
    for (const u of crew) {
      await endpoints.demo.friendJoin({ user_id: u.id, move_id: move.id, status: 'there' });
      changed();
      await sleep(BEAT_MS / 2);
    }
    await endpoints.demo.moment(crew[0].id, move.id);
    changed();
    await sleep(BEAT_MS);
    await endpoints.demo.endMove(move.id);
    changed();
    router.push(`/move/${encodeURIComponent(move.id)}/rate` as Href);
    return 'Move ended · rate it';
  };

  const off = cast.loading && !cast.users.length;
  return (
    <DemoSection title="Scenes" note="A whole beat of the demo in one tap. Steps land a couple of seconds apart.">
      <DemoButton
        label="Friends fill my Move"
        sub="Three friends pull up one by one, then one arrives"
        icon="users"
        disabled={off}
        run={fillMyMove}
      />
      <DemoButton
        label="A friend is nearby"
        sub="Tony posts at Kumo, then the phones meet: 'Add yourself?'"
        icon="location"
        disabled={off}
        run={friendNearby}
      />
      <DemoButton
        label="After the Move"
        sub="Friends arrive, a tagged Moment, then end and rate"
        icon="flag"
        disabled={off}
        run={afterTheMove}
      />
    </DemoSection>
  );
}

export default DemoScenesSection;
