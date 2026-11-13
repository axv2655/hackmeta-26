import { endpoints } from '@/lib/endpoints';
import { parseIso } from '@/lib/format';
import { useSuggestions } from '@/lib/suggestions';
import type { Category, Move, Suggestion } from '@/lib/types';

/** Seeded Marks a friend can post a Move at, with ready-made text. */
export type FriendMovePreset = { markId: string; place: string; text: string; category: Category };

export const FRIEND_MOVE_PRESETS: FriendMovePreset[] = [
  { markId: 'mk_kumo_matcha', place: 'Kumo Matcha', text: 'Grabbing matcha at Kumo, come through', category: 'coffee' },
  { markId: 'mk_founders_hall', place: 'Founders Hall', text: 'Studying at Founders Hall till 6', category: 'study' },
  { markId: 'mk_chipotle', place: 'Chipotle', text: "I'm going to Chipotle", category: 'food' },
];

/** My most recent live Move, or an error the button turns into a toast. */
export async function latestMoveOf(meId: string): Promise<Move> {
  const mine = (await endpoints.moves.feed())
    .filter((m) => m.creator.id === meId && m.status === 'live')
    .sort((a, b) => parseIso(b.starts_at) - parseIso(a.starts_at));
  if (!mine.length) throw new Error('You have no live Move. Make one first.');
  return mine[0];
}

/**
 * Put a suggestion Demo Control just created into the suggestions store, so
 * `/suggestion/{id}` finds it without waiting for the realtime reload.
 */
export function rememberSuggestion(s: Suggestion): void {
  useSuggestions.setState((st) => ({
    items: [s, ...st.items.filter((x) => x.id !== s.id)],
    status: 'ready',
    error: null,
  }));
}

/** Short JSON for a Muse output line in the stats card. */
export function preview(value: unknown, max = 140): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
