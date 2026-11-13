import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassSurface } from '@/components/ui/Glass';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors } from '@/lib/theme';

export type MapStatusPillsProps = {
  /** First load still running. */
  loading: boolean;
  /** Load failed: the message, shown with Retry. */
  error: string | null;
  onRetry: () => void;
  /** Nothing was near the phone, so the map shows the campus world. */
  nearCampus: boolean;
  /** Location permission is off. */
  locationOff: boolean;
  onOpenSettings: () => void;
};

/** Small glass pills under the map header: loading, error with Retry, campus, location off. */
export function MapStatusPills({ loading, error, onRetry, nearCampus, locationOff, onOpenSettings }: MapStatusPillsProps) {
  return (
    <View style={styles.col} pointerEvents="box-none">
      {loading ? (
        <GlassSurface radius={16} style={styles.pill}>
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={styles.text}>Loading Moves</Text>
        </GlassSurface>
      ) : null}
      {error ? (
        <PressableScale onPress={onRetry} accessibilityLabel={`${error}. Retry`} scaleTo={0.96}>
          <GlassSurface radius={16} style={styles.pill}>
            <Icon name="info" size={15} color={colors.textSecondary} />
            <Text style={styles.text} numberOfLines={1}>
              {error}
            </Text>
            <Text style={styles.action}>Retry</Text>
          </GlassSurface>
        </PressableScale>
      ) : null}
      {nearCampus ? <Chip icon="map-pin" text="Showing Moves near campus" /> : null}
      {locationOff ? (
        <PressableScale onPress={onOpenSettings} accessibilityLabel="Location off. Open Settings" scaleTo={0.96}>
          <Chip icon="location" text="Location off" action="Settings" />
        </PressableScale>
      ) : null}
    </View>
  );
}

function Chip({ icon, text, action }: { icon: IconName; text: string; action?: string }) {
  return (
    <GlassSurface radius={16} style={styles.pill}>
      <Icon name={icon} size={15} color={colors.textSecondary} />
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  col: { alignItems: 'flex-start', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  text: { fontSize: 13, lineHeight: 17, fontWeight: '600', color: colors.text, flexShrink: 1 },
  action: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: colors.blue },
});
