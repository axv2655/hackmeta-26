import type { StyleProp, ViewStyle } from 'react-native';
import { SymbolView, type SFSymbol, type SymbolWeight } from 'expo-symbols';

import { Icon, type IconName } from '@/components/ui/Icon';

export type FeedSymbolProps = {
  /** SF Symbol drawn natively on iOS. */
  name: SFSymbol;
  /** Custom glyph used where SF Symbols are unavailable (web). */
  fallback: IconName;
  size: number;
  color: string;
  /** Fallback glyph uses its filled variant. */
  filled?: boolean;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
};

/** An SF Symbol with a matching custom-glyph fallback, for feed chrome (Like / Comment / Share). */
export function FeedSymbol({ name, fallback, size, color, filled = false, weight = 'regular', style }: FeedSymbolProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      style={[{ width: size, height: size }, style]}
      fallback={<Icon name={fallback} size={size} color={color} filled={filled} />}
      accessible={false}
    />
  );
}

export default FeedSymbol;
