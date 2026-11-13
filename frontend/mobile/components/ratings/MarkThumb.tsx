import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { Icon } from '@/components/ui/Icon';
import { BACKEND_URL } from '@/lib/backend';
import { categoryMeta } from '@/lib/categories';
import type { MuseMark } from '@/lib/types';

function photoUri(url: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  return `${BACKEND_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Mark photo, or its category icon on the category color when it has none. */
export function MarkThumb({ mark, size = 44 }: { mark: MuseMark; size?: number }) {
  const meta = categoryMeta(mark.category);
  const uri = photoUri(mark.photo_url);
  const box = { width: size, height: size, borderRadius: Math.round(size / 4) };
  return (
    <View style={[styles.box, box, { backgroundColor: meta.color }]}>
      <Icon name={meta.icon} size={Math.round(size * 0.48)} color="#FFFFFF" />
      {uri ? <Image source={{ uri }} style={[StyleSheet.absoluteFill, box]} contentFit="cover" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});

export default MarkThumb;
