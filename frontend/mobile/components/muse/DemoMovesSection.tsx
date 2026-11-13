import { useRouter, type Href } from 'expo-router';

import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { useSession } from '@/lib/session';

import { DemoButton } from './DemoButton';
import { useOpenSuggestion } from './DemoMuseSection';
import { DemoSection } from './DemoSection';
import { latestMoveOf } from './demoActions';

/** End my newest Move (then rate it), or let Muse react to nobody joining. */
export function DemoMovesSection() {
  const router = useRouter();
  const meId = useSession((s) => s.userId);
  const openSuggestion = useOpenSuggestion();

  const endLatest = async () => {
    const move = await latestMoveOf(meId);
    await endpoints.demo.endMove(move.id);
    appEvents.emit('moves.changed');
    router.push(`/move/${encodeURIComponent(move.id)}/rate` as Href);
    return 'Move ended';
  };

  const nobodyBit = async () => {
    const move = await latestMoveOf(meId);
    const res = await endpoints.demo.nobodyBit(move.id);
    appEvents.emit('moves.changed');
    return openSuggestion(res, 'Muse had nothing better to suggest');
  };

  return (
    <DemoSection title="Moves">
      <DemoButton label="End my latest Move" sub="Leaves Ghosts, then opens the rating" icon="flag" run={endLatest} />
      <DemoButton
        label="Nobody bit"
        sub="Muse suggests somewhere friends already are"
        icon="sparkles"
        run={nobodyBit}
      />
    </DemoSection>
  );
}

export default DemoMovesSection;
