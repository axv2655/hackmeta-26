import type { ComponentType } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import LArrowLeft from 'lucide-react-native/icons/arrow-left';
import LAtSign from 'lucide-react-native/icons/at-sign';
import LBell from 'lucide-react-native/icons/bell';
import LBellOff from 'lucide-react-native/icons/bell-off';
import LBookmark from 'lucide-react-native/icons/bookmark';
import LBriefcase from 'lucide-react-native/icons/briefcase';
import LCake from 'lucide-react-native/icons/cake';
import LCalendar from 'lucide-react-native/icons/calendar';
import LCamera from 'lucide-react-native/icons/camera';
import LCheck from 'lucide-react-native/icons/check';
import LCircleCheck from 'lucide-react-native/icons/circle-check';
import LCirclePlus from 'lucide-react-native/icons/circle-plus';
import LCircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import LCircleX from 'lucide-react-native/icons/circle-x';
import LClock from 'lucide-react-native/icons/clock';
import LCoffee from 'lucide-react-native/icons/coffee';
import LCompass from 'lucide-react-native/icons/compass';
import LCopy from 'lucide-react-native/icons/copy';
import LDownload from 'lucide-react-native/icons/download';
import LDumbbell from 'lucide-react-native/icons/dumbbell';
import LExternalLink from 'lucide-react-native/icons/external-link';
import LEye from 'lucide-react-native/icons/eye';
import LEyeOff from 'lucide-react-native/icons/eye-off';
import LFlag from 'lucide-react-native/icons/flag';
import LFlame from 'lucide-react-native/icons/flame';
import LGamepad2 from 'lucide-react-native/icons/gamepad-2';
import LGift from 'lucide-react-native/icons/gift';
import LGraduationCap from 'lucide-react-native/icons/graduation-cap';
import LHistory from 'lucide-react-native/icons/history';
import LImage from 'lucide-react-native/icons/image';
import LImages from 'lucide-react-native/icons/images';
import LInfo from 'lucide-react-native/icons/info';
import LLink from 'lucide-react-native/icons/link';
import LLock from 'lucide-react-native/icons/lock';
import LLogOut from 'lucide-react-native/icons/log-out';
import LMap from 'lucide-react-native/icons/map';
import LMapPin from 'lucide-react-native/icons/map-pin';
import LMessageCircle from 'lucide-react-native/icons/message-circle';
import LMessageCirclePlus from 'lucide-react-native/icons/message-circle-plus';
import LMic from 'lucide-react-native/icons/mic';
import LMoon from 'lucide-react-native/icons/moon';
import LMusic from 'lucide-react-native/icons/music';
import LNavigation from 'lucide-react-native/icons/navigation';
import LPartyPopper from 'lucide-react-native/icons/party-popper';
import LPause from 'lucide-react-native/icons/pause';
import LPencil from 'lucide-react-native/icons/pencil';
import LPlay from 'lucide-react-native/icons/play';
import LQrCode from 'lucide-react-native/icons/qr-code';
import LRepeat2 from 'lucide-react-native/icons/repeat-2';
import LRoute from 'lucide-react-native/icons/route';
import LRss from 'lucide-react-native/icons/rss';
import LSend from 'lucide-react-native/icons/send';
import LSettings from 'lucide-react-native/icons/settings';
import LShield from 'lucide-react-native/icons/shield';
import LSlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import LSmile from 'lucide-react-native/icons/smile';
import LSparkles from 'lucide-react-native/icons/sparkles';
import LSquareArrowOutUpRight from 'lucide-react-native/icons/square-arrow-out-up-right';
import LStar from 'lucide-react-native/icons/star';
import LStore from 'lucide-react-native/icons/store';
import LTag from 'lucide-react-native/icons/tag';
import LTicket from 'lucide-react-native/icons/ticket';
import LTrash2 from 'lucide-react-native/icons/trash-2';
import LUserCheck from 'lucide-react-native/icons/user-check';
import LUserPlus from 'lucide-react-native/icons/user-plus';
import LUsers from 'lucide-react-native/icons/users';
import LUtensils from 'lucide-react-native/icons/utensils';
import LVideo from 'lucide-react-native/icons/video';
import LVolume2 from 'lucide-react-native/icons/volume-2';
import LVolumeX from 'lucide-react-native/icons/volume-x';
import LZap from 'lucide-react-native/icons/zap';

import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Custom glyphs
//
// Facebook-specific icons that lucide lacks or draws differently, on a 24x24
// grid. Each glyph is a list of primitives:
//   p  path data          c  circle [cx, cy, r]        r  rect [x, y, w, h, rx]
//   f  fill with the icon color      s  stroke width (stroked in the icon color)
//   eo even-odd fill rule (for cut-outs that show the background through)
// ---------------------------------------------------------------------------

type Prim = {
  p?: string;
  c?: readonly [number, number, number];
  r?: readonly [number, number, number, number, number];
  f?: 1;
  s?: number;
  eo?: 1;
};

const GLYPHS = {
  home: [
    { p: 'M3.5 10.6c0-.6.27-1.17.73-1.55l6.5-5.4a2 2 0 0 1 2.54 0l6.5 5.4c.46.38.73.95.73 1.55v7.9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z', s: 2 },
    { p: 'M9.75 20.5v-4.5a1.25 1.25 0 0 1 1.25-1.25h2a1.25 1.25 0 0 1 1.25 1.25v4.5', s: 2 },
  ],
  'home-filled': [{ p: 'M3.5 10.6c0-.6.27-1.17.73-1.55l6.5-5.4a2 2 0 0 1 2.54 0l6.5 5.4c.46.38.73.95.73 1.55v7.9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM9 15.25a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4.5H9z', f: 1, s: 2, eo: 1 }],
  reels: [
    { r: [3, 3, 18, 18, 4.75], s: 2 },
    { p: 'M3 9.15h18', s: 2 },
    { p: 'M8.2 3.2l2.6 5.9M14.3 3.2l2.6 5.9', s: 1.8 },
    { p: 'M10.3 12.6v5l4.4-2.5z', f: 1, s: 1.2 },
  ],
  'reels-filled': [
    { p: 'M2 9.9h20V17a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5zM10 12.7l5.2 2.95-5.2 2.95z', f: 1, eo: 1 },
    { p: 'M2 8.4V7a5 5 0 0 1 5-5h.3l2.8 6.4zM9 2h4.7l2.8 6.4h-4.7zM15.4 2H17a5 5 0 0 1 5 5v1.4h-3.8z', f: 1 },
  ],
  moves: [
    { p: 'M12 21.3S5 15.4 5 10a7 7 0 0 1 14 0c0 5.4-7 11.3-7 11.3z', s: 2 },
    { p: 'M12 6.4c.35 2.1 1.5 3.25 3.6 3.6-2.1.35-3.25 1.5-3.6 3.6-.35-2.1-1.5-3.25-3.6-3.6 2.1-.35 3.25-1.5 3.6-3.6z', f: 1, s: 0.8 },
  ],
  'moves-filled': [{ p: 'M12 22.4S4 16 4 10a8 8 0 0 1 16 0c0 6-8 12.4-8 12.4zM12 5.6c.42 2.55 1.85 3.98 4.4 4.4-2.55.42-3.98 1.85-4.4 4.4-.42-2.55-1.85-3.98-4.4-4.4 2.55-.42 3.98-1.85 4.4-4.4z', f: 1, eo: 1 }],
  profile: [
    { c: [12, 12, 9], s: 2 },
    { c: [12, 9.75, 2.75], s: 2 },
    { p: 'M6.4 18.3c.9-2.4 3-3.8 5.6-3.8s4.7 1.4 5.6 3.8', s: 2 },
  ],
  'profile-filled': [{ p: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM12 6.3a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 1 0 0-6.2zM12 14.4c2.6 0 4.8 1.4 5.8 3.5a8.3 8.3 0 0 1-11.6 0c1-2.1 3.2-3.5 5.8-3.5z', f: 1, eo: 1 }],
  notifications: [
    { p: 'M12 2.75c-3.6 0-6.25 2.8-6.25 6.3v2.9c0 .7-.2 1.4-.6 2l-1.1 1.7c-.6 1 .1 2.35 1.3 2.35h13.3c1.2 0 1.9-1.35 1.3-2.35l-1.1-1.7c-.4-.6-.6-1.3-.6-2v-2.9c0-3.5-2.65-6.3-6.25-6.3z', s: 2 },
    { p: 'M9.6 20.6c.5.8 1.4 1.3 2.4 1.3s1.9-.5 2.4-1.3', s: 2 },
  ],
  'notifications-filled': [
    { p: 'M12 2.75c-3.6 0-6.25 2.8-6.25 6.3v2.9c0 .7-.2 1.4-.6 2l-1.1 1.7c-.6 1 .1 2.35 1.3 2.35h13.3c1.2 0 1.9-1.35 1.3-2.35l-1.1-1.7c-.4-.6-.6-1.3-.6-2v-2.9c0-3.5-2.65-6.3-6.25-6.3z', f: 1, s: 2 },
    { p: 'M9 20.4h6c-.5 1.2-1.7 2-3 2s-2.5-.8-3-2z', f: 1 },
  ],
  menu: [{ p: 'M3.5 6h17M3.5 12h17M3.5 18h17', s: 2.2 }],
  'menu-filled': [{ p: 'M3.5 6h17M3.5 12h17M3.5 18h17', s: 3 }],
  messenger: [{ p: 'M12 0C5.24 0 0 4.952 0 11.64c0 3.499 1.434 6.521 3.769 8.61a.96.96 0 0 1 .323.683l.065 2.135a.96.96 0 0 0 1.347.85l2.381-1.053a.96.96 0 0 1 .641-.046A13 13 0 0 0 12 23.28c6.76 0 12-4.952 12-11.64S18.76 0 12 0m6.806 7.44c.522-.03.971.567.63 1.094l-4.178 6.457a.707.707 0 0 1-.977.208l-3.87-2.504a.44.44 0 0 0-.49.007l-4.363 3.01c-.637.438-1.415-.317-.995-.966l4.179-6.457a.706.706 0 0 1 .977-.21l3.87 2.505c.15.097.344.094.491-.007l4.362-3.01a.7.7 0 0 1 .364-.127', f: 1, eo: 1 }],
  like: [
    { r: [2.75, 10.25, 3.75, 9.75, 1], s: 1.7 },
    { p: 'M6.5 11h.7c.5 0 .95-.28 1.18-.72l2.6-5.1c.3-.6.9-.93 1.55-.93.95 0 1.72.77 1.72 1.72 0 .2-.03.4-.1.58L14.1 9.5H19c1.2 0 2.1 1.1 1.85 2.28l-1.25 6a2.75 2.75 0 0 1-2.7 2.2H6.5', s: 1.7 },
  ],
  'like-filled': [
    { r: [2.6, 10.5, 3, 9.5, 0.8], f: 1, s: 1.2 },
    { p: 'M7.6 11h.7c.5 0 .95-.28 1.18-.72l2.6-5.1c.3-.6.9-.93 1.55-.93.95 0 1.72.77 1.72 1.72 0 .2-.03.4-.1.58L14.1 9.5H19c1.2 0 2.1 1.1 1.85 2.28l-1.25 6a2.75 2.75 0 0 1-2.7 2.2H7.6z', f: 1, s: 1.2 },
  ],
  comment: [{ p: 'M6.5 4.5h11a3.25 3.25 0 0 1 3.25 3.25v6A3.25 3.25 0 0 1 17.5 17h-6.3l-3.6 3c-.45.38-1.1.06-1.1-.5V17a3.25 3.25 0 0 1-3.25-3.25v-6A3.25 3.25 0 0 1 6.5 4.5z', s: 1.7 }],
  'comment-filled': [{ p: 'M6.5 4.5h11a3.25 3.25 0 0 1 3.25 3.25v6A3.25 3.25 0 0 1 17.5 17h-6.3l-3.6 3c-.45.38-1.1.06-1.1-.5V17a3.25 3.25 0 0 1-3.25-3.25v-6A3.25 3.25 0 0 1 6.5 4.5z', f: 1, s: 1.7 }],
  share: [{ p: 'M13.75 4.6l7 6.65-7 6.65v-3.7c-4.4-.15-7.7 1.3-9.9 4.6.5-5.9 3.9-9.6 9.9-10.2z', s: 1.7 }],
  'share-filled': [{ p: 'M13.75 4.6l7 6.65-7 6.65v-3.7c-4.4-.15-7.7 1.3-9.9 4.6.5-5.9 3.9-9.6 9.9-10.2z', f: 1, s: 1.7 }],
  heart: [{ p: 'M12 20.7C5.6 16.4 3 13.1 3 9.6 3 6.9 5.1 4.8 7.7 4.8c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.6 0 4.7 2.1 4.7 4.8 0 3.5-2.6 6.8-9 11.1z', s: 1.9 }],
  'heart-filled': [{ p: 'M12 20.7C5.6 16.4 3 13.1 3 9.6 3 6.9 5.1 4.8 7.7 4.8c1.7 0 3.3.9 4.3 2.4 1-1.5 2.6-2.4 4.3-2.4 2.6 0 4.7 2.1 4.7 4.8 0 3.5-2.6 6.8-9 11.1z', f: 1, s: 1.2 }],
  globe: [{ p: 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM8 5.2c1.7-.5 3.4.2 3.9 1.5.5 1.3-.5 2.2-1.6 2.8-1 .6-.7 1.8-1.8 2.4-1.2.6-2.7-.2-3.4-1.6-.8-1.8.4-4.4 2.9-5.1zM14.4 12c1.6-.5 3.7.3 4.3 1.9.6 1.7-.7 3.8-2.4 4.6-1.3.6-2.4-.3-2.6-1.7-.2-1-1-1.7-.9-2.8.1-1 .7-1.7 1.6-2zM15 4.6c1.3.2 2.6 1 3.4 2 .5.7-.2 1.4-1 1.2-1.1-.3-2.4-.6-3.1-1.6-.5-.8-.1-1.7.7-1.6z', f: 1, eo: 1 }],
  friends: [
    { c: [8.6, 7.7, 3.3], f: 1 },
    { p: 'M2.2 19.2c0-3.6 2.8-6.2 6.4-6.2s6.4 2.6 6.4 6.2c0 .7-.5 1.3-1.3 1.3H3.5c-.8 0-1.3-.6-1.3-1.3z', f: 1 },
    { c: [17.2, 8.7, 2.6], f: 1 },
    { p: 'M16.6 20.5h4c.8 0 1.4-.6 1.4-1.4 0-3-2-5.4-4.8-5.4-.9 0-1.7.2-2.4.6 1.2 1.3 1.9 3 1.9 4.9 0 .5 0 .9-.1 1.3z', f: 1 },
  ],
  'friend-add': [
    { c: [10, 7.5, 3.6], f: 1 },
    { p: 'M3 19.4c0-3.9 3-6.6 7-6.6 1.5 0 2.8.4 3.9 1-1 1-1.6 2.3-1.6 3.8 0 1.1.3 2.1.9 2.9H4.3c-.8 0-1.3-.5-1.3-1.1z', f: 1 },
    { p: 'M18 14.2v6.6M14.7 17.5h6.6', s: 2 },
  ],
  photo: [{ p: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM8.6 6.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 1 0 0-3.8zM5.2 16.8l3.6-4c.5-.5 1.2-.5 1.7 0l1.9 2 2.3-2.7c.5-.6 1.3-.6 1.8 0l2.3 2.8V17a1.8 1.8 0 0 1-1.8 1.8H7a1.8 1.8 0 0 1-1.8-1.8z', f: 1, eo: 1 }],
  more: [
    { c: [5, 12, 1.9], f: 1 },
    { c: [12, 12, 1.9], f: 1 },
    { c: [19, 12, 1.9], f: 1 },
  ],
  close: [{ p: 'M5.5 5.5l13 13M18.5 5.5l-13 13', s: 2 }],
  'chevron-left': [{ p: 'M14.75 5l-7 7 7 7', s: 2.2 }],
  'chevron-right': [{ p: 'M9.25 5l7 7-7 7', s: 2.2 }],
  'chevron-down': [{ p: 'M5 9.25l7 7 7-7', s: 2.2 }],
  'chevron-up': [{ p: 'M5 14.75l7-7 7 7', s: 2.2 }],
  plus: [{ p: 'M12 4.5v15M4.5 12h15', s: 2 }],
  /** Plus inside a rounded square: the Home header "create" button. */
  'plus-square': [
    { r: [3, 3, 18, 18, 5], s: 1.9 },
    { p: 'M12 8v8M8 12h8', s: 1.9 },
  ],
  /** Three dots inside a thin outline circle: the header "more" button. */
  'more-circle': [
    { c: [12, 12, 10], s: 1.6 },
    { c: [7.6, 12, 1.45], f: 1 },
    { c: [12, 12, 1.45], f: 1 },
    { c: [16.4, 12, 1.45], f: 1 },
  ],
  search: [
    { c: [10.75, 10.75, 7.25], s: 2.1 },
    { p: 'M16.1 16.1l4.65 4.65', s: 2.1 },
  ],
} as const satisfies Record<string, readonly Prim[]>;

// ---------------------------------------------------------------------------
// Generic outline glyphs, straight from lucide (imported one by one so the
// bundle only carries the icons listed here).
// ---------------------------------------------------------------------------

type LucideComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const LUCIDE = {
  'arrow-left': LArrowLeft,
  'at-sign': LAtSign,
  bell: LBell,
  'bell-off': LBellOff,
  bookmark: LBookmark,
  briefcase: LBriefcase,
  cake: LCake,
  calendar: LCalendar,
  camera: LCamera,
  check: LCheck,
  'check-circle': LCircleCheck,
  clock: LClock,
  coffee: LCoffee,
  compass: LCompass,
  copy: LCopy,
  download: LDownload,
  dumbbell: LDumbbell,
  external: LExternalLink,
  eye: LEye,
  'eye-off': LEyeOff,
  filter: LSlidersHorizontal,
  flag: LFlag,
  flame: LFlame,
  gamepad: LGamepad2,
  gift: LGift,
  graduation: LGraduationCap,
  help: LCircleQuestionMark,
  history: LHistory,
  image: LImage,
  images: LImages,
  info: LInfo,
  link: LLink,
  lock: LLock,
  logout: LLogOut,
  map: LMap,
  'map-pin': LMapPin,
  location: LMapPin,
  message: LMessageCircle,
  'message-plus': LMessageCirclePlus,
  mic: LMic,
  moon: LMoon,
  music: LMusic,
  navigation: LNavigation,
  party: LPartyPopper,
  pause: LPause,
  pencil: LPencil,
  play: LPlay,
  'plus-circle': LCirclePlus,
  'qr-code': LQrCode,
  repost: LRepeat2,
  route: LRoute,
  rss: LRss,
  send: LSend,
  settings: LSettings,
  'share-external': LSquareArrowOutUpRight,
  shield: LShield,
  smile: LSmile,
  sparkles: LSparkles,
  star: LStar,
  store: LStore,
  tag: LTag,
  ticket: LTicket,
  trash: LTrash2,
  'user-check': LUserCheck,
  'user-plus': LUserPlus,
  users: LUsers,
  utensils: LUtensils,
  video: LVideo,
  volume: LVolume2,
  'volume-off': LVolumeX,
  'x-circle': LCircleX,
  zap: LZap,
} as const satisfies Record<string, LucideComponent>;

export type CustomIconName = keyof typeof GLYPHS;
export type LucideIconName = keyof typeof LUCIDE;
export type IconName = CustomIconName | LucideIconName;

/** Every icon name, custom glyphs first. Handy for a debug gallery. */
export const iconNames = [...Object.keys(GLYPHS), ...Object.keys(LUCIDE)] as IconName[];

export type IconProps = {
  name: IconName;
  /** Width and height in points. Default 24. */
  size?: number;
  /** Default `colors.text`. */
  color?: string;
  /** Use the `<name>-filled` glyph when one exists (tab icons, like, comment, share, heart). */
  filled?: boolean;
  /** Stroke width for lucide icons only (default 2). Custom glyphs have fixed weights. */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Set when the icon carries meaning on its own; otherwise it is hidden from screen readers. */
  accessibilityLabel?: string;
};

function isCustom(name: string): name is CustomIconName {
  return Object.prototype.hasOwnProperty.call(GLYPHS, name);
}

export function Icon({ name, size = 24, color = colors.text, filled = false, strokeWidth = 2, style, accessibilityLabel }: IconProps) {
  const filledName = `${name}-filled`;
  const resolved: IconName = filled && isCustom(filledName) ? filledName : name;
  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel } as const)
    : ({ accessible: false, importantForAccessibility: 'no', 'aria-hidden': true } as const);

  if (!isCustom(resolved)) {
    const Lucide: LucideComponent = LUCIDE[resolved];
    return (
      <View style={[{ width: size, height: size }, style]} {...a11y}>
        <Lucide size={size} color={color} strokeWidth={strokeWidth} />
      </View>
    );
  }

  const prims: readonly Prim[] = GLYPHS[resolved];
  return (
    <View style={[{ width: size, height: size }, style]} {...a11y}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {prims.map((prim, i) => {
          const paint = {
            fill: prim.f ? color : 'none',
            stroke: prim.s ? color : 'none',
            strokeWidth: prim.s ?? 0,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            fillRule: prim.eo ? 'evenodd' : 'nonzero',
          } as const;
          if (prim.p) return <Path key={i} d={prim.p} {...paint} />;
          if (prim.c) return <Circle key={i} cx={prim.c[0]} cy={prim.c[1]} r={prim.c[2]} {...paint} />;
          if (prim.r) {
            const [x, y, width, height, rx] = prim.r;
            return <Rect key={i} x={x} y={y} width={width} height={height} rx={rx} {...paint} />;
          }
          return null;
        })}
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type IconBadgeProps = {
  name: IconName;
  /** Circle fill. */
  color: string;
  /** Circle diameter. Default 24. */
  size?: number;
  /** Glyph color. Default white. */
  iconColor?: string;
  /** 2pt white ring, for badges that overlap an avatar or each other. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A small filled circle with a glyph inside: notification-type badges, shortcut bullets. */
export function IconBadge({ name, color, size = 24, iconColor = colors.white, ring = false, style }: IconBadgeProps) {
  const outer = ring ? size + 4 : size;
  return (
    <View
      style={[
        styles.badge,
        { width: outer, height: outer, borderRadius: outer / 2, backgroundColor: color },
        ring && styles.ring,
        style,
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.6)} color={iconColor} />
    </View>
  );
}

export type ReactionKind = 'like' | 'love';

export type ReactionBadgeProps = {
  kind: ReactionKind;
  /** Circle diameter. Default 18. */
  size?: number;
  /** 2pt white ring so stacked badges separate cleanly. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Blue circle with a white thumb ('like') or red circle with a white heart ('love'). */
export function ReactionBadge({ kind, size = 18, ring = false, style }: ReactionBadgeProps) {
  return (
    <IconBadge
      name={kind === 'like' ? 'like-filled' : 'heart-filled'}
      color={kind === 'like' ? colors.blue : colors.love}
      size={size}
      ring={ring}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 2, borderColor: colors.white },
});

export default Icon;
