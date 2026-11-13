import Constants from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MuseBadge } from '@/components/common/MuseBadge';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { LinkRow, SettingsGroup } from '@/components/settings/SettingsRow';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { useMuseStatus } from '@/lib/muse';
import { useSettings } from '@/lib/settings';
import { colors, spacing, type as typeScale } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { Me } from '@/lib/types';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Taps on the version line, inside this window, that open Demo Control. */
const SECRET_TAPS = 5;
const SECRET_WINDOW_MS = 2500;

/**
 * The version footer. Hidden way into Demo Control for the presenter: tap it
 * five times quickly, or long-press it. Looks and reads like plain text.
 */
function VersionLine({ onUnlock }: { onUnlock: () => void }) {
  const taps = useRef<number[]>([]);
  const onPress = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < SECRET_WINDOW_MS), now];
    if (taps.current.length >= SECRET_TAPS) {
      taps.current = [];
      onUnlock();
    }
  };
  return (
    <Pressable onPress={onPress} onLongPress={onUnlock} delayLongPress={800} accessibilityRole="text">
      <Text style={styles.version}>Moves {VERSION}</Text>
    </Pressable>
  );
}

function MuseRow() {
  const status = useMuseStatus((s) => s.status);
  const loading = useMuseStatus((s) => s.loading);
  const load = useMuseStatus((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  const live = Boolean(status?.live);
  const subtitle = loading
    ? 'Checking Muse'
    : live
      ? `Muse is answering${status?.model ? ` (${status.model})` : ''}. It proposes, you decide.`
      : 'Muse uses its built-in rules right now. Suggestions still work, labeled "heuristic".';
  return (
    <LinkRow
      icon="sparkles"
      title={live ? 'Muse: live' : 'Muse: heuristic mode'}
      subtitle={subtitle}
      right={<MuseBadge source={live ? 'muse' : 'heuristic'} />}
    />
  );
}

function VerifyRow({ me }: { me: Me }) {
  const verifying = useSettings((s) => s.verifying);
  const verify = useSettings((s) => s.verify);
  if (me.user.fb_verified) {
    return (
      <LinkRow
        icon="shield"
        title="Verified with Facebook"
        subtitle="Friends see a check next to your name."
        right={<VerifiedBadge size={18} />}
      />
    );
  }
  return (
    <LinkRow
      icon="shield"
      title="Verify with Facebook"
      subtitle="Show friends it's really you."
      busy={verifying}
      onPress={async () => {
        if (await verify()) toast('Verified with Facebook');
      }}
    />
  );
}

function SettingsBody({ me }: { me: Me }) {
  const router = useRouter();
  const go = (href: string) => router.push(href as Href);
  return (
    <>
      <View style={styles.account}>
        <Text style={styles.name}>{me.user.name}</Text>
        {me.user.home_area ? <Text style={styles.area}>{me.user.home_area}</Text> : null}
      </View>
      <SettingsGroup title="Account">
        <VerifyRow me={me} />
      </SettingsGroup>
      <SettingsGroup title="Settings">
        <LinkRow
          icon="lock"
          title="Privacy"
          subtitle="Location, nearby, ghosts and kinds of Moves"
          onPress={() => go('/settings/privacy')}
        />
        <LinkRow
          divider
          icon="bell"
          title="Notifications"
          subtitle="Muse suggestions and quiet hours"
          onPress={() => go('/settings/notifications')}
        />
        <LinkRow
          divider
          icon="eye-off"
          title="Hidden from"
          subtitle="People who never see your Moves"
          onPress={() => go('/settings/hidden')}
        />
        <LinkRow
          divider
          icon="user-check"
          title="Auto-join"
          subtitle="Join these friends' Moves without a prompt"
          onPress={() => go('/settings/autojoin')}
        />
        <LinkRow
          divider
          icon="users"
          title="Circles"
          subtitle="Your saved audiences"
          onPress={() => go('/circles')}
        />
      </SettingsGroup>
      <SettingsGroup title="Muse">
        <MuseRow />
        <LinkRow
          divider
          icon="link"
          title="Connect Muse"
          subtitle="Post Moves from Meta AI and your glasses"
          onPress={() => go('/settings/muse')}
        />
      </SettingsGroup>
      <VersionLine onUnlock={() => go('/demo')} />
    </>
  );
}

export default function SettingsScreen() {
  return <SettingsPage title="Settings">{(me) => <SettingsBody me={me} />}</SettingsPage>;
}

const styles = StyleSheet.create({
  account: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  name: { ...typeScale.screenTitle },
  area: { ...typeScale.rowSub },
  version: { ...typeScale.meta, textAlign: 'center', marginTop: spacing.xxl, color: colors.placeholder },
});
