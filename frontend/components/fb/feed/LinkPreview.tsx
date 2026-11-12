import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { LinkPreview as LinkPreviewData } from '@/lib/mock';
import { colors, hairline, layout, type as typeScale } from '@/lib/theme';

export type LinkPreviewProps = {
  link: LinkPreviewData;
  style?: StyleProp<ViewStyle>;
};

/** Gray footer under a link post's image: "SOURCE · 2-MIN READ" and the headline. */
export function LinkPreview({ link, style }: LinkPreviewProps) {
  return (
    <View style={[styles.footer, style]}>
      <Text style={styles.source} numberOfLines={1}>
        {`${link.source} · ${link.readTime}`.toUpperCase()}
      </Text>
      <Text style={styles.title} numberOfLines={2}>
        {link.title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: layout.gutter,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    ...hairline('Bottom'),
  },
  source: { ...typeScale.caps },
  title: { ...typeScale.name },
});

export default LinkPreview;
