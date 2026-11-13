/**
 * Pure helpers for the phone calendar (no React Native imports, so `node --test`
 * can load this file). A device event becomes a busy block of start and end
 * only; titles stay in `LocalEvent`, which never leaves the phone.
 */

export type DeviceEvent = {
  title?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay?: boolean;
  availability?: string;
  status?: string;
};

/** What `PUT /calendar/busy` takes. */
export type BusyBlockWire = { start: string; end: string };

/** A device event kept on the phone, to label the server's title-less blocks. */
export type LocalEvent = { title: string; start: number; end: number };

/** How far ahead the phone reads, matching the server's 24 h replace span. */
export const SYNC_SPAN_MS = 24 * 60 * 60 * 1000;
/** More than this many blocks in a day is noise; the server only needs the next few hours. */
const MAX_BLOCKS = 60;

const ms = (d: string | Date): number => (d instanceof Date ? d.getTime() : Date.parse(d));

/** True for events that make you unavailable: timed, not cancelled, not marked "free". */
export function isBusy(event: DeviceEvent): boolean {
  if (event.allDay) return false;
  if (event.availability === 'free') return false;
  if (event.status === 'canceled') return false;
  const start = ms(event.startDate);
  const end = ms(event.endDate);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/**
 * Busy device events in `[now, now + span)` merged into non-overlapping blocks,
 * earliest first. Merging also hides how many meetings make up a busy stretch.
 */
export function toBusyBlocks(events: readonly DeviceEvent[], now: number, span = SYNC_SPAN_MS): BusyBlockWire[] {
  const until = now + span;
  const spans = events
    .filter(isBusy)
    .map((e) => ({ start: ms(e.startDate), end: ms(e.endDate) }))
    .filter((s) => s.end > now && s.start < until)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, s.end) };
    else merged.push(s);
  }
  return merged
    .slice(0, MAX_BLOCKS)
    .map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() }));
}

/** Busy device events with their titles, for display on this phone only. */
export function toLocalEvents(events: readonly DeviceEvent[]): LocalEvent[] {
  return events
    .filter(isBusy)
    .map((e) => ({ title: (e.title ?? '').trim() || 'Busy', start: ms(e.startDate), end: ms(e.endDate) }))
    .sort((a, b) => a.start - b.start);
}

/** "Standup · 1:1 with Sam": the phone's own titles for a server block, or null. */
export function localTitleFor(local: readonly LocalEvent[], startIso: string, endIso: string): string | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const titles = local.filter((e) => e.start < end && e.end > start).map((e) => e.title);
  const unique = [...new Set(titles)];
  return unique.length ? unique.join(' · ') : null;
}

/** "iCloud, Gmail": the accounts the phone calendar reads from, deduplicated. */
export function sourceNames(calendars: readonly { source?: { name?: string | null } | null; title?: string }[]): string[] {
  const names = calendars.map((c) => (c.source?.name || c.title || '').trim()).filter(Boolean);
  return [...new Set(names)];
}
