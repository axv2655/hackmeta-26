import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { tap } from '@/lib/haptics';
import { saveSnapshot } from '@/lib/snapshots';
import { toast } from '@/lib/toast';
import { colors } from '@/lib/theme';

/**
 * `/move/[id]/snap`: a full-screen viewfinder with one shutter. The photo
 * becomes a snapshot on the Move (`lib/snapshots`). `?sample=1` keeps it on
 * the phone (no backend). Asks for the camera here, where the user tapped.
 */
export default function SnapScreen() {
  const { id, sample } = useLocalSearchParams<{ id: string; sample?: string }>();
  const moveId = String(id ?? '');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const camera = useRef<CameraView>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const shoot = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const pic = await camera.current?.takePictureAsync({ quality: 0.7 });
      if (!pic?.uri) throw new Error('no photo');
      tap();
      saveSnapshot(moveId, pic.uri, sample === '1');
      close();
    } catch {
      toast("Couldn't take the snapshot. Try again.");
      setBusy(false);
    }
  };

  const top = { top: insets.top + 8 };
  const closeButton = (
    <Pressable onPress={close} hitSlop={12} style={[styles.round, styles.left, top]} accessibilityLabel="Close camera">
      <Icon name="x-circle" size={26} color={colors.white} />
    </Pressable>
  );

  if (!permission?.granted) {
    const blocked = permission !== null && !permission.canAskAgain;
    return (
      <View style={[styles.root, styles.center]}>
        {closeButton}
        <Icon name="camera" size={40} color={colors.white} />
        <Text style={styles.msg}>
          {permission === null || !blocked
            ? 'Allow the camera to snap this Move.'
            : 'Camera access is off. Turn it on in Settings to take snapshots.'}
        </Text>
        <Button
          title={blocked ? 'Open Settings' : 'Allow camera'}
          variant="primary"
          onPress={() => (blocked ? void Linking.openSettings() : void requestPermission())}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} onCameraReady={() => setReady(true)} />
      {closeButton}
      <Pressable
        onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
        hitSlop={12}
        style={[styles.round, styles.right, top]}
        accessibilityLabel="Flip camera"
      >
        <Icon name="repost" size={24} color={colors.white} />
      </Pressable>
      <Pressable
        onPress={() => void shoot()}
        disabled={!ready || busy}
        style={({ pressed }) => [styles.shutter, { bottom: insets.bottom + 32 }, (pressed || busy) && styles.shutterDown]}
        accessibilityRole="button"
        accessibilityLabel="Take snapshot"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  msg: { color: colors.white, fontSize: 16, lineHeight: 22, textAlign: 'center' },
  round: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: { left: 16 },
  right: { right: 16 },
  shutter: {
    position: 'absolute',
    alignSelf: 'center',
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 5,
    borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  shutterDown: { transform: [{ scale: 0.92 }], backgroundColor: 'rgba(255,255,255,0.6)' },
});
