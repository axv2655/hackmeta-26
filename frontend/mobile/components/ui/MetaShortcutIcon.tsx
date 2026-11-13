import { Image as NativeImage, View } from 'react-native';
import { Image } from 'expo-image';

// Same 36px cells and offsets as frontend/web/src/App.jsx SHORTCUTS.
const offsets = { friends: 851, pages: 333, groups: 185, memories: 1221, saved: 518, reels: 111, marketplace: 999 };
const source = require('@/assets/meta/sidebar.webp');
// resolveAssetSource is native only; on web fall back to the sprite's real size.
const SPRITE = { width: 37, height: 1702 };
const dimensions = NativeImage.resolveAssetSource?.(source) ?? SPRITE;
export type MetaShortcut = keyof typeof offsets;
export function isMetaShortcut(name: string): name is MetaShortcut { return name in offsets; }

export function MetaShortcutIcon({ name, size = 32 }: { name: MetaShortcut; size?: number }) {
  const scale = size / 36;
  return (
    <View accessible={false} style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image source={source} contentFit="fill" style={{ position: 'absolute', left: 0,
        top: -offsets[name] * scale, width: dimensions.width * scale, height: dimensions.height * scale }} />
    </View>
  );
}
