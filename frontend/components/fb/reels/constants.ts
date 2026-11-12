import { Easing } from 'react-native-reanimated';
import type { TextStyle } from 'react-native';

import { motion } from '@/lib/theme';

/** How long one reel "plays" before its progress bar loops. */
export const REEL_DURATION_MS = 8000;

/** One sweep of the slow zoom/pan over the still frame. It then reverses. */
export const KEN_BURNS_SWEEP_MS = 14000;

/** Two taps closer together than this count as a double tap. */
export const DOUBLE_TAP_MS = 260;

/** Width reserved on the right for the action rail; the caption block stops before it. */
export const RAIL_COLUMN_WIDTH = 68;

/** Gap between the bottom of the overlays and the progress bar. */
export const OVERLAY_BOTTOM_INSET = 12;

export const PROGRESS_BAR_HEIGHT = 2;

/**
 * The bar floats just above the page edge instead of sitting on it, so its
 * white fill never merges with the tab bar's white active-tab line below.
 */
export const PROGRESS_BOTTOM_INSET = 6;

/** Track behind the progress fill. No theme token is this light. */
export const PROGRESS_TRACK_COLOR = 'rgba(255,255,255,0.28)';

/** Translucent pill behind the place chip. */
export const CHIP_BACKGROUND = 'rgba(0,0,0,0.45)';

/** Gradient stops (top to bottom) that keep white text legible over any photo. */
export const BOTTOM_GRADIENT = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.8)'] as const;
export const BOTTOM_GRADIENT_STOPS = [0, 0.5, 1] as const;
export const TOP_GRADIENT = ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)'] as const;

/** Soft shadow under white text and counts that sit directly on the media. */
export const textShadow: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

export const EASE_OUT = Easing.bezier(motion.easeOut[0], motion.easeOut[1], motion.easeOut[2], motion.easeOut[3]);
