import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/ui/Glass';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/PressableScale';
import { tap } from '@/lib/haptics';
import { useInbox } from '@/lib/store/inbox';
import { useMyMoves } from '@/lib/store/moves';
import { colors } from '@/lib/theme';

const SHOW_MS = 4500;

/**
 * Top-of-screen banner for a notification that just arrived over the socket
 * (ARCHITECTURE.md 9.1). Tapping it opens the Move on the map.
 */
export function InAppBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const banner = useInbox((s) => s.banner);
  const dismiss = useInbox((s) => s.dismissBanner);

  useEffect(() => {
    if (!banner) return;
    tap();
    const timer = setTimeout(dismiss, SHOW_MS);
    return () => clearTimeout(timer);
  }, [banner, dismiss]);

  if (!banner) return null;
  const moveId = banner.data?.move_id;
  return (
    <Animated.View
      key={banner.id}
      entering={FadeInUp.springify().damping(18)}
      exiting={FadeOutUp.duration(180)}
      style={[styles.wrap, { top: insets.top + 6 }]}
      pointerEvents="box-none"
    >
      <PressableScale
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}. ${banner.body}`}
        onPress={() => {
          dismiss();
          if (moveId) {
            useMyMoves.getState().focus(moveId);
            router.navigate('/moves');
          }
        }}
      >
        <GlassSurface radius={22} style={styles.card}>
          <View style={styles.icon}>
            <Icon name="moves-filled" size={18} color={colors.white} />
          </View>
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {banner.title}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {banner.body}
            </Text>
          </View>
        </GlassSurface>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, zIndex: 1000 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, lineHeight: 18, color: colors.textSecondary },
});
