import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout } from '@/lib/theme';

export type SectionBandProps = {
  /** Band thickness. Default 6. */
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

/** The full-width gray band that separates feed units. */
export function SectionBand({ height = layout.bandHeight, color = colors.band, style }: SectionBandProps) {
  return <View style={[{ height, backgroundColor: color, alignSelf: 'stretch' }, style]} />;
}

export default SectionBand;
