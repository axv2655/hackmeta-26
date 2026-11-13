import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hairlineWidth } from '@/lib/theme';

export type HairlineProps = {
  /** Inset from both ends (horizontal margin, or vertical margin when `vertical`). Default 0. */
  inset?: number;
  color?: string;
  /** Draw a vertical divider that stretches to its row's height. */
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** One-pixel divider. Horizontal by default: `<Hairline inset={12} />` under a post's counts row. */
export function Hairline({ inset = 0, color = colors.hairline, vertical = false, style }: HairlineProps) {
  return (
    <View
      style={[
        vertical
          ? { width: hairlineWidth, alignSelf: 'stretch', marginVertical: inset }
          : { height: hairlineWidth, alignSelf: 'stretch', marginHorizontal: inset },
        { backgroundColor: color },
        style,
      ]}
    />
  );
}

export default Hairline;
