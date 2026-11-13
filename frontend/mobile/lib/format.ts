/**
 * Time and distance labels. Countdowns and "ago" labels use `serverNow()`, so
 * a shifted demo clock on the backend shows correctly on the phone.
 * `lib/realtime.ts` feeds `setServerNow` from each envelope's `ts`; the Demo
 * screen feeds it from `/demo/time` and `/demo/state`.
 */

let skewMs = 0;

/**
 * Milliseconds for a backend ISO timestamp, or NaN. Python sends microseconds
 * ("...:05.123456+00:00"); the fraction is cut to milliseconds first so every
 * JS engine parses it.
 */
export function parseIso(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
}

/** Record the server's current time (stores server minus device skew). */
export function setServerNow(iso: string): void {
  const t = parseIso(iso);
  if (Number.isFinite(t)) skewMs = t - Date.now();
}

/** The server's current time in ms since the epoch. */
export function serverNow(): number {
  return Date.now() + skewMs;
}

function toMs(iso: string): number {
  const t = parseIso(iso);
  return Number.isFinite(t) ? t : serverNow();
}

/** Facebook-style age: "now", "4 m", "3 h", "2 d". */
export function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((serverNow() - toMs(iso)) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

/** Whole minutes from now until `iso` (negative once passed). */
export function minutesUntil(iso: string): number {
  const ms = toMs(iso) - serverNow();
  return ms >= 0 ? Math.ceil(ms / 60000) : Math.floor(ms / 60000);
}

/** A Flare's fill countdown: "fills in 7 min" or "fill window closed". */
export function untilLabel(iso: string): string {
  const m = minutesUntil(iso);
  if (m <= 0) return 'fill window closed';
  if (m < 60) return `fills in ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `fills in ${h} h ${rest} min` : `fills in ${h} h`;
}

/** Kilometres as a miles label: "0.4 mi". */
export function miles(km: number): string {
  const mi = km * 0.621371;
  if (mi < 0.1) return '< 0.1 mi';
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`;
}

function clock(d: Date): { text: string; period: 'AM' | 'PM' } {
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${m.toString().padStart(2, '0')}`, period: h < 12 ? 'AM' : 'PM' };
}

/** "2:10-3:00 PM", or "11:30 AM-12:15 PM" across noon. */
export function timeRange(startIso: string, endIso: string): string {
  const a = clock(new Date(toMs(startIso)));
  const b = clock(new Date(toMs(endIso)));
  return a.period === b.period ? `${a.text}-${b.text} ${b.period}` : `${a.text} ${a.period}-${b.text} ${b.period}`;
}
