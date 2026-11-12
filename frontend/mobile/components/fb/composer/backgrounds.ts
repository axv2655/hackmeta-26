import { colors } from '@/lib/theme';

/** A colored canvas for short text posts. Rendered as a diagonal two-stop gradient. */
export type ComposerBackground = {
  id: string;
  /** Spoken name for the swatch. */
  name: string;
  colors: readonly [string, string];
};

// Every stop keeps white bold text at 3:1 or better.
export const composerBackgrounds: readonly ComposerBackground[] = [
  { id: 'blue', name: 'Blue', colors: [colors.blue, '#3D5AF1'] },
  { id: 'violet', name: 'Violet', colors: ['#6A3DE8', '#C13CE0'] },
  { id: 'sunset', name: 'Sunset', colors: ['#F25C05', '#E4266B'] },
  { id: 'green', name: 'Green', colors: ['#0A7A4F', '#1FA06A'] },
  { id: 'red', name: 'Red', colors: [colors.badgeRed, '#A8112B'] },
  { id: 'night', name: 'Night', colors: ['#18191A', '#3E4042'] },
];

export function getBackground(id: string | null | undefined): ComposerBackground | undefined {
  if (id == null) return undefined;
  return composerBackgrounds.find((bg) => bg.id === id);
}

export const GRADIENT_START = { x: 0, y: 0 } as const;
export const GRADIENT_END = { x: 1, y: 1 } as const;

/** Text over a background shrinks as it gets longer so it keeps fitting the card. */
export function canvasTextSize(length: number): { fontSize: number; lineHeight: number } {
  if (length <= 60) return { fontSize: 28, lineHeight: 36 };
  if (length <= 130) return { fontSize: 22, lineHeight: 28 };
  return { fontSize: 18, lineHeight: 24 };
}
