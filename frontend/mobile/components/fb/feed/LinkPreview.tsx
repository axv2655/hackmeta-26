import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { LinkPreview as LinkPreviewData } from '@/lib/mock';
import { colors, layout, spacing, type as typeScale } from '@/lib/theme';

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
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 2,
    backgroundColor: colors.surface,
  },
  source: { ...typeScale.caps, fontSize: 13, lineHeight: 17 },
  title: { ...typeScale.name, fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 },
});

export default LinkPreview;
