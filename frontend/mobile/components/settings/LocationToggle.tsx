import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { useLocation } from '@/lib/location';
import { useSettings } from '@/lib/settings';
import { spacing, type as typeScale } from '@/lib/theme';

import { ToggleRow } from './SettingsRow';

function openPhoneSettings(): void {
  Linking.openSettings().catch(() => Alert.alert('Open Settings', "Find Moves in your phone's Settings app."));
}

/**
 * Location opt-in. Turning it on asks the OS in context; a denial reverts the
 * toggle and offers the phone's Settings. Coming back from there re-reads the
 * permission without prompting, so the toggle catches up.
 */
export function LocationToggle({ value, divider }: { value: boolean; divider?: boolean }) {
  const patch = useSettings((s) => s.patch);
  const permission = useLocation((s) => s.permission);
  const [asking, setAsking] = useState(false);
  /** Set when we sent the user to the phone's Settings to allow location. */
  const wantsOn = useRef(false);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const recheck = useCallback(async () => {
    if (!valueRef.current && !wantsOn.current) return;
    await useLocation.getState().recheck();
    if (wantsOn.current && useLocation.getState().permission === 'granted') {
      wantsOn.current = false;
      void patch({ location_opt_in: true });
    }
  }, [patch]);

  useEffect(() => {
    void recheck();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck();
    });
    return () => sub.remove();
  }, [recheck]);

  const turnOn = async () => {
    setAsking(true);
    await useLocation.getState().start();
    setAsking(false);
    if (useLocation.getState().permission === 'granted') {
      void patch({ location_opt_in: true });
      return;
    }
    Alert.alert(
      'Location is off for Moves',
      "Allow it in your phone's Settings to see Marks near you. Everything else works without it.",
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: () => {
            wantsOn.current = true;
            openPhoneSettings();
          },
        },
      ],
    );
  };

  const turnOff = () => {
    wantsOn.current = false;
    useLocation.getState().stop();
    void patch({ location_opt_in: false });
  };

  const blockedByOs = value && permission === 'denied';
  return (
    <ToggleRow
      divider={divider}
      icon="location"
      title="Location"
      subtitle="Shows Marks and Moves near you. Only a rough area is ever sent."
      value={value}
      busy={asking}
      onValueChange={(next) => (next ? void turnOn() : turnOff())}
    >
      {blockedByOs ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Location is off in your phone&apos;s Settings, so Moves uses a default spot.
          </Text>
          <Button
            title="Open Settings"
            size="sm"
            variant="tinted"
            onPress={() => {
              wantsOn.current = true;
              openPhoneSettings();
            }}
          />
        </View>
      ) : null}
    </ToggleRow>
  );
}

const styles = StyleSheet.create({
  notice: { gap: spacing.sm, alignItems: 'flex-start', paddingLeft: 36 + spacing.md },
  noticeText: { ...typeScale.meta },
});
