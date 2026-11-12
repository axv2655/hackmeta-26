import { radius } from '@/lib/theme';

/**
 * Story tile metrics for the iOS 26 home feed (measured off the reference at 393pt wide):
 * three full tiles plus a sliver of the fourth are visible.
 */
export const STORY_CARD_WIDTH = 114;
export const STORY_CARD_HEIGHT = 204;
export const STORY_CARD_RADIUS = radius.lg;
/** Faint outline drawn over every tile so light photos keep an edge on white. */
export const STORY_CARD_BORDER = 'rgba(0,0,0,0.1)';
