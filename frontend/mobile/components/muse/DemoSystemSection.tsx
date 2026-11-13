import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { errorMessage } from '@/lib/backend';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { useSuggestions } from '@/lib/suggestions';
import { colors, type as typeScale } from '@/lib/theme';
import type { IconName } from '@/components/ui/Icon';

import { DemoButton } from './DemoButton';
import { DemoSection } from './DemoSection';

export type DemoSystemSectionProps = {
  /** 'http' when the server has a Muse key; otherwise Muse is heuristic only. */
  client: 'http' | 'fake';
  deterministic: boolean;
  onDeterministic: (deterministic: boolean) => void;
};

/** What each background job does, in the words of the demo. */
const JOBS: Record<string, { label: string; sub: string; icon: IconName }> = {
  end_stale_moves: { label: 'Auto-end stale Moves', sub: 'Ends Moves past their time, as if hours went by', icon: 'clock' },
  muse_expire_suggestions: { label: 'Expire old suggestions', sub: 'Clears Muse cards past their window', icon: 'history' },
  example_moves: { label: 'Refresh example Moves', sub: "Brings the seeded friends' Moves back to life", icon: 'repost' },
  proximity_purge: { label: 'Purge old sightings', sub: 'Drops Bluetooth sightings older than 2 h', icon: 'trash' },
  muse_flare_scan: { label: 'Flare scan for everyone', sub: 'The autonomous Muse loop, once', icon: 'flame' },
  muse_nobody_bit: { label: 'Nobody-bit scan', sub: 'Muse checks every quiet Move', icon: 'sparkles' },
  muse_pseudo_groups: { label: 'Revive scan for everyone', sub: 'Recomputes crews and fading groups', icon: 'users' },
};

function jobInfo(name: string) {
  return JOBS[name] ?? { label: name.replace(/_/g, ' '), sub: 'Runs this background job now', icon: 'zap' as IconName };
}

type Jobs = { names: string[]; error: string | null };

/** Muse live vs heuristic, a push check, and the background jobs on demand. */
export function DemoSystemSection({ client, deterministic, onDeterministic }: DemoSystemSectionProps) {
  const [jobs, setJobs] = useState<Jobs>({ names: [], error: null });

  const loadJobs = useCallback(async () => {
    try {
      setJobs({ names: (await endpoints.demo.jobs()).jobs, error: null });
    } catch (e) {
      setJobs({ names: [], error: errorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const flipMuse = async () => {
    const res = await endpoints.demo.museMode(deterministic);
    onDeterministic(res.deterministic);
    return res.deterministic ? 'Muse answers from its heuristics' : 'Muse asks the live model';
  };

  const runJob = async (name: string) => {
    const res = await endpoints.demo.runJob(name);
    appEvents.emit('moves.changed');
    void useSuggestions.getState().load();
    const count = res.result && res.result !== '0' ? ` · ${res.result}` : '';
    return `${jobInfo(name).label}: done${count}`;
  };

  const keyless = client !== 'http';
  return (
    <DemoSection title="System" note="Show the fallback story, check push, and run background jobs now.">
      <DemoButton
        label={deterministic || keyless ? 'Muse: heuristic' : 'Muse: live model'}
        sub={
          keyless
            ? 'No Muse key on the server, so heuristics only'
            : deterministic
              ? 'Tap to use the live model'
              : 'Tap to fall back to heuristics (as if Muse were down)'
        }
        icon="sparkles"
        disabled={keyless}
        run={flipMuse}
      />
      <DemoButton
        label="Send me a test notification"
        sub="Checks the banner and push on this phone"
        icon="bell"
        run={async () => {
          await endpoints.demo.notifyTest();
          return 'Sent';
        }}
      />
      {jobs.error ? <Text style={styles.error}>{jobs.error}</Text> : null}
      {jobs.names.map((name) => {
        const info = jobInfo(name);
        return <DemoButton key={name} label={info.label} sub={info.sub} icon={info.icon} run={() => runJob(name)} />;
      })}
    </DemoSection>
  );
}

const styles = StyleSheet.create({
  error: { ...typeScale.meta, color: colors.textSecondary },
});

export default DemoSystemSection;
