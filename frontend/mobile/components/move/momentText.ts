import type { Moment } from '@/lib/types';

/** Author first, then the tagged people, without repeats. */
export function momentPeople(m: Moment, myId: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const u of [m.author, ...m.tags.map((t) => t.user)]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    names.push(u.id === myId ? 'You' : u.first_name);
  }
  return names;
}

/** "Maya, Priya and you were here". */
export function wereHere(m: Moment, myId: string): string {
  const names = momentPeople(m, myId).map((n, i) => (i > 0 && n === 'You' ? 'you' : n));
  if (names.length === 1) return `${names[0]} ${names[0] === 'You' ? 'were' : 'was'} here`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')} and ${last} were here`;
}

/** True when I'm tagged and haven't answered yet. */
export function needsMyAnswer(m: Moment, myId: string): boolean {
  return m.tags.some((t) => t.user.id === myId && t.approved === null);
}
