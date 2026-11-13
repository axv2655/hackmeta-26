import { create } from 'zustand';

import { errorMessage } from './backend';
import { endpoints } from './endpoints';
import { serverNow } from './format';
import { onLogout } from './session';
import { toast } from './toast';
import type { MoveDraft, PseudoGroup } from './types';

/**
 * Your crews (Pseudo-groups, `GET /pseudo-groups`): groups Muse infers from
 * Moves you went to together. Only you see them. Mute is optimistic with
 * rollback; revive returns a Muse draft for the composer.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';

type CrewsState = {
  items: PseudoGroup[];
  status: Status;
  error: string | null;
  /** Crew id with a revive draft in flight. */
  reviving: string | null;
  load: () => Promise<void>;
  /** Mute (true) or unmute (false). Muted crews are never suggested for a revive. */
  setMuted: (id: string, muted: boolean) => Promise<void>;
  /** Asks Muse for a revive draft. Null when it failed (a toast already said why). */
  revive: (id: string) => Promise<MoveDraft | null>;
};

/** Fading (and not muted) first, then strongest; muted crews last. */
export function sortCrews(items: PseudoGroup[]): PseudoGroup[] {
  const rank = (g: PseudoGroup) => (g.muted ? 2 : g.fading ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b) || b.strength - a.strength);
}

const DOING: Record<string, string> = {
  food: 'grab food',
  coffee: 'get coffee',
  study: 'study',
  fitness: 'work out',
  nightlife: 'go out',
  outdoors: 'head outside',
  games: 'play games',
  shopping: 'go shopping',
  errand: 'run errands',
  other: 'hang out',
};

const DAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

const WHEN: Record<string, string> = {
  morning: 'in the morning',
  lunch: 'at lunch',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  late: 'late at night',
};

function strings(values: unknown[] | undefined): string[] {
  return (values ?? []).filter((v): v is string => typeof v === 'string');
}

function dayPhrase(values: unknown[] | undefined): string {
  const days = (values ?? []).filter((v): v is number => typeof v === 'number' && v >= 0 && v < 7);
  if (days.length === 1) return `on ${DAYS[days[0]]}`;
  if (days.length === 2) return `on ${DAYS[days[0]]} and ${DAYS[days[1]]}`;
  return '';
}

function sinceLabel(iso: string): string {
  const days = Math.max(0, Math.round((serverNow() - new Date(iso).getTime()) / 86_400_000));
  if (days < 2) return 'a day';
  if (days < 14) return `${days} days`;
  return `${Math.round(days / 7)} weeks`;
}

/** "Muse noticed you {this}": e.g. "work out together on Tuesdays in the evening". */
export function patternSummary(g: PseudoGroup): string {
  const category = strings(g.pattern.categories)[0];
  const bucket = strings(g.pattern.hour_buckets)[0];
  const parts = [
    `${DOING[category ?? 'other'] ?? 'hang out'} together`,
    dayPhrase(g.pattern.weekdays),
    bucket ? (WHEN[bucket] ?? '') : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/** "Last together 3 weeks ago", or null with no hangout on record. */
export function lastTogether(g: PseudoGroup): string | null {
  return g.last_hangout_at ? `Last together ${sinceLabel(g.last_hangout_at)} ago` : null;
}

export const useCrews = create<CrewsState>()((set, get) => ({
  items: [],
  status: 'idle',
  error: null,
  reviving: null,
  load: async () => {
    if (get().status !== 'ready') set({ status: 'loading', error: null });
    try {
      set({ items: sortCrews(await endpoints.pseudoGroups.list()), status: 'ready', error: null });
    } catch (e) {
      if (get().items.length) {
        set({ status: 'ready' });
        toast(errorMessage(e));
      } else {
        set({ status: 'error', error: errorMessage(e) });
      }
    }
  },
  setMuted: async (id, muted) => {
    const before = get().items;
    set({ items: sortCrews(before.map((g) => (g.id === id ? { ...g, muted } : g))) });
    try {
      if (muted) await endpoints.pseudoGroups.mute(id);
      else await endpoints.pseudoGroups.unmute(id);
      toast(muted ? "Muse won't suggest this crew again" : 'Muse can suggest this crew again');
    } catch (e) {
      set({ items: before });
      toast(errorMessage(e));
    }
  },
  revive: async (id) => {
    if (get().reviving) return null;
    set({ reviving: id });
    try {
      return await endpoints.pseudoGroups.revive(id);
    } catch (e) {
      toast(errorMessage(e));
      return null;
    } finally {
      set({ reviving: null });
    }
  },
}));

onLogout(() => useCrews.setState({ items: [], status: 'idle', error: null, reviving: null }));
