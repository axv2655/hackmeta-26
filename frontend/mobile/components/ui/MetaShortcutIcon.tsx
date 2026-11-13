import { Image as NativeImage, View } from 'react-native';
import { Image } from 'expo-image';

// Same 36px cells and offsets as frontend/web/src/App.jsx SHORTCUTS.
const offsets = { friends: 851, pages: 333, groups: 185, memories: 1221, saved: 518, reels: 111, marketplace: 999 };
const source = require('@/assets/meta/sidebar.webp');
const dimensions = NativeImage.resolveAssetSource(source);
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
