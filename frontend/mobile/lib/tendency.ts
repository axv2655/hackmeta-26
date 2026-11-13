import { clockTime } from './format';
import type { Move } from './types';

/**
 * The tendency tab text for a live Move: "Started 7:00, Tony's Kumo Moves
 * usually last ~2h". The server sends the "usually last" part from the
 * creator's past Moves; the start time is formatted here so it is in the
 * viewer's own time zone. Null when the Move is not live or has no tendency.
 */
export function tendencyText(move: Pick<Move, 'status' | 'starts_at' | 'tendency'>): string | null {
  if (move.status !== 'live' || !move.tendency?.line) return null;
  return `Started ${clockTime(move.starts_at)}, ${move.tendency.line}`;
}
