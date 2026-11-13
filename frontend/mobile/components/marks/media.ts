import { BACKEND_URL } from '@/lib/backend';
import { parseIso, serverNow, ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Ghost } from '@/lib/types';

/** A backend media path ("/media/...") or absolute URL as an image source. */
export function mediaSource(url: string | null | undefined): { uri: string; headers?: Record<string, string> } | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return { uri: url };
  const path = url.startsWith('/') ? url : `/${url}`;
  // Moment media is private: the backend checks the viewer on every request.
  return { uri: `${BACKEND_URL}${path}`, headers: { 'X-User-Id': useSession.getState().userId } };
}

const HOUR = 3600_000;

/** "earlier today", "last night", "yesterday", or "3 d ago" for when a ghost was at a place. */
export function whenPhrase(iso: string): string {
  const t = parseIso(iso);
  if (!Number.isFinite(t)) return 'recently';
  const now = new Date(serverNow());
  const then = new Date(t);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startOfToday) return serverNow() - t < 3 * HOUR ? 'a little while ago' : 'earlier today';
  if (t >= startOfToday - 24 * HOUR) return then.getHours() >= 17 ? 'last night' : 'yesterday';
  return `${ago(iso)} ago`;
}

/** The most recent ghost, or undefined. */
export function latestGhost(ghosts: Ghost[]): Ghost | undefined {
  return [...ghosts].sort((a, b) => parseIso(b.at) - parseIso(a.at))[0];
}

/** "Maya was here last night" / "Maya and 2 others were here last night". */
export function ghostLine(ghosts: Ghost[]): string | null {
  const latest = latestGhost(ghosts);
  if (!latest) return null;
  const others = new Set(ghosts.map((g) => g.user.id)).size - 1;
  const when = whenPhrase(latest.at);
  if (others <= 0) return `${latest.user.first_name} was here ${when}`;
  return `${latest.user.first_name} and ${others} ${others === 1 ? 'other' : 'others'} were here ${when}`;
}
