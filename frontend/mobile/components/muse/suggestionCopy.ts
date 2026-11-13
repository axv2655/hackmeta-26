import { parseIso } from '@/lib/format';
import type { MoveOrigin, Suggestion, SuggestionType } from '@/lib/types';

/**
 * Copy and routing rules for a Muse suggestion, by type. Kept in one place so
 * the reasoning card, the buttons and the accept handler agree.
 */

const TITLES: Record<SuggestionType, string> = {
  flare: 'Send a flare?',
  free_time: "You've got a window",
  revive: 'Get the crew back together?',
  reel_move: 'Somewhere to go',
  nobody_bit: 'Somewhere to go',
  route: 'Somewhere to go',
};

export function suggestionTitle(type: SuggestionType): string {
  return TITLES[type];
}

/** The primary button. A "nobody bit" with a Move to join says Pull up. */
export function primaryLabel(s: Suggestion): string {
  switch (s.type) {
    case 'flare':
      return 'Send flare';
    case 'revive':
      return 'Get everyone back';
    case 'nobody_bit':
      return s.target_move_id ? 'Pull up' : 'Start a Move';
    default:
      return 'Start a Move';
  }
}

const ORIGINS: Record<SuggestionType, MoveOrigin> = {
  flare: 'saved_flare',
  free_time: 'free_time',
  revive: 'revive',
  reel_move: 'reel',
  nobody_bit: 'nobody_bit',
  route: 'manual',
};

/** Where a Move made from this suggestion came from (composer `origin`). */
export function originFor(type: SuggestionType): MoveOrigin {
  return ORIGINS[type];
}

/** Types whose accept posts the Move straight away (no composer), so the text is editable here. */
export function postsDirectly(s: Suggestion): boolean {
  return (s.type === 'flare' || s.type === 'free_time') && Boolean(s.draft?.mark);
}

/** Walking time at ~5 km/h: "10 min away", "1 h 5 min away". */
export function walkLabel(km: number): string {
  const minutes = Math.max(1, Math.round((km / 5) * 60));
  if (minutes < 60) return `${minutes} min away`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} h ${rest} min away` : `${h} h away`;
}

/** Pending and not past its expiry (judged against server time). */
export function isOpen(s: Suggestion, nowMs: number): boolean {
  const expires = parseIso(s.expires_at);
  return s.status === 'pending' && (!Number.isFinite(expires) || expires > nowMs);
}
