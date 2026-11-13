import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

// Flat gray-blue palette of Facebook's empty-state illustrations.
const ink = {
  ground: colors.surface,
  light: colors.band,
  mid: '#BCC0C4',
  face: '#DADDE1',
  dark: colors.placeholder,
  hair: colors.textSecondary,
  black: colors.text,
  sky: '#A8C7FA',
  blue: colors.blue,
  white: colors.white,
} as const;

const VIEW_X = 16;
const VIEW_Y = 12;
const VIEW_W = 208;
const VIEW_H = 132;

/** Teardrop map pin: a circle of radius `r` at (cx, cy) with the tip 2.3r below the center. */
function pinPath(cx: number, cy: number, r: number): string {
  const tip = cy + r * 2.3;
  return [
    `M${cx} ${tip}`,
    `C${cx - r * 0.35} ${cy + r * 1.9} ${cx - r} ${cy + r * 0.9} ${cx - r} ${cy}`,
    `A${r} ${r} 0 1 1 ${cx + r} ${cy}`,
    `C${cx + r} ${cy + r * 0.9} ${cx + r * 0.35} ${cy + r * 1.9} ${cx} ${tip}Z`,
  ].join(' ');
}

export type MovesIllustrationProps = {
  /** Rendered width in points; height follows the aspect ratio. Default 208. */
  width?: number;
  style?: StyleProp<ViewStyle>;
};

/** Two friends and their pins around a big Moves pin. Decorative, original artwork. */
export function MovesIllustration({ width = VIEW_W, style }: MovesIllustrationProps) {
  const height = (width * VIEW_H) / VIEW_W;

  return (
    <View
      style={[{ width, height }, style]}
      accessible={false}
      aria-hidden
    >
      <Svg width={width} height={height} viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}>
        {/* Ground */}
        <Path d="M74.75 140A72 72 0 1 1 165.25 140Z" fill={ink.ground} />
        <Circle cx={88} cy={24} r={3} fill={ink.light} />
        <Circle cx={158} cy={32} r={2.5} fill={ink.sky} />
        <Circle cx={24} cy={92} r={2.5} fill={ink.light} />

        {/* Friend on the left, with their pin */}
        <Path d="M34 140V108a10 10 0 0 1 10-10h26a10 10 0 0 1 10 10V140Z" fill={ink.light} />
        <Rect x={46} y={58} width={22} height={22} rx={5} fill={ink.black} />
        <Rect x={47} y={66} width={20} height={28} rx={10} fill={ink.sky} />
        <Path d={pinPath(57, 33, 9)} fill={ink.sky} />
        <Circle cx={57} cy={33} r={3.5} fill={ink.white} />

        {/* Friend on the right, with their pin */}
        <Path d="M156 140a30 30 0 0 1 60 0Z" fill={ink.dark} />
        <Circle cx={176} cy={81} r={7} fill={ink.hair} />
        <Circle cx={188} cy={93} r={13} fill={ink.face} />
        <Path d="M175 93a13 13 0 0 1 26 0Z" fill={ink.hair} />
        <Path d={pinPath(196, 47, 9)} fill={ink.mid} />
        <Circle cx={196} cy={47} r={3.5} fill={ink.white} />

        {/* The Move: same pin-and-spark as the tab icon */}
        <Ellipse cx={120} cy={137} rx={13} ry={3} fill={ink.light} />
        <Path d={pinPath(120, 70, 28)} fill={ink.blue} />
        <Circle cx={120} cy={70} r={16} fill={ink.white} />
        <Path
          d="M120 60c.95 5.8 4.2 9.05 10 10-5.8.95-9.05 4.2-10 10-.95-5.8-4.2-9.05-10-10 5.8-.95 9.05-4.2 10-10z"
          fill={ink.blue}
        />
      </Svg>
    </View>
  );
}

export default MovesIllustration;
