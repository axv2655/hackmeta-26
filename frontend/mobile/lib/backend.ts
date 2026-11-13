import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';

const PORT = 8000;

/** Mirrors `GlassesDraft` in backend/app/api/routes/glasses.py. No coordinates, ever. */
export type GlassesDraft = {
  understood: boolean;
  /** What to say back, e.g. "getting boba at Kumo. Say confirm to post." */
  spoken: string;
  draft_id: string | null;
  text: string | null;
  category: string | null;
  /** Name of the Mark the Move will go to, or null when `needs_place`. */
  place: string | null;
  /** How the place was chosen. 'usual' = their most-visited spot, 'demo' = the demo Mark. */
  place_source: 'nearby' | 'muse' | 'named' | 'usual' | 'demo' | 'new' | 'phone' | null;
  /** True when no place could be found: no draft is held, ask "where at?" and say it again. */
  needs_place: boolean;
  expires_at: string | null;
};

/** Mirrors `GlassesPosted`. */
export type GlassesPosted = {
  move_id: string;
  text: string;
  spoken: string;
};

export type BackendFetchOptions = NonNullable<Parameters<typeof fetch>[1]>;
type FetchResponse = Awaited<ReturnType<typeof fetch>>;

// With no EXPO_PUBLIC_BACKEND_URL, aim at the machine serving the Expo bundle.
// On a phone that is the laptop's LAN IP (taken from the dev server's
// hostUri), so the backend has to listen on 0.0.0.0 rather than 127.0.0.1.
function defaultBase(): string {
  if (Platform.OS === 'web') return `${window.location.protocol}//${window.location.hostname}:${PORT}`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${PORT}`;
}

// Expo statically substitutes EXPO_PUBLIC_* values into native release builds.
export const BACKEND_URL: string = (process.env.EXPO_PUBLIC_BACKEND_URL || defaultBase()).replace(/\/$/, '');

/**
 * A failed backend call. `status` is the HTTP status, or 0 when the server
 * could not be reached at all. `detail` is the server's `detail` string (or
 * "status statusText"), and is also the Error message.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function readDetail(res: FetchResponse): Promise<string> {
  const detail: unknown = await res.json().then(
    (b: { detail?: unknown }) => b?.detail,
    () => null,
  );
  if (typeof detail === 'string') return detail;
  // FastAPI validation errors: [{ msg, loc, ... }]
  if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg as string;
  return `${res.status} ${res.statusText}`.trim();
}

/**
 * The phone's own time zone, sent on every request so times the server writes
 * ("free til 2:50") match this phone's clock. A zone name is not a location.
 */
function zoneHeaders(): [string, string][] {
  const headers: [string, string][] = [['X-UTC-Offset', String(-new Date().getTimezoneOffset())]];
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) headers.push(['X-Timezone', zone]);
  } catch {
    // No Intl zone on this runtime: the offset alone is enough.
  }
  return headers;
}

/**
 * Calls `${BACKEND_URL}/api/v1${path}`. JSON bodies get a Content-Type header
 * automatically. Resolves to the parsed JSON body, or `null` for a 204.
 * Rejects with an `ApiError`: the HTTP status and detail on a non-2xx
 * response, status 0 when the network request itself failed.
 */
export async function backendFetch<T = unknown>(path: string, options: BackendFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  // FormData (photo uploads) sets its own multipart Content-Type with the boundary.
  const json = options.body && !(options.body instanceof FormData);
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  for (const [name, value] of zoneHeaders()) headers.set(name, value);
  let res: FetchResponse;
  try {
    res = await fetch(`${BACKEND_URL}/api/v1${path}`, { ...options, headers });
  } catch (e) {
    throw new ApiError(0, e instanceof Error && e.message ? e.message : 'Network request failed');
  }
  if (!res.ok) throw new ApiError(res.status, await readDetail(res));
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** True when the backend could not be reached (not an HTTP error). */
export function isOffline(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}

/** Human text for any thrown value, for toasts and error states. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Can't reach Moves right now";
    if (e.status === 401) return 'Please log in again';
    if (e.status >= 500) return 'Something went wrong on our side. Try again.';
    return e.detail || 'Something went wrong';
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong';
}

/** Glasses calls. They take the auth headers (`authHeaders()`) because this module cannot import the session store. */
export const api = {
  /**
   * "Hey Meta, start a Move": turn an utterance into a draft. Posts nothing.
   * Send `lat`/`lng` already rounded to ~100 m (`coarse()`); the server uses them for one
   * nearest-Mark lookup and never stores them. Takes the user id because this module
   * cannot import the session store (it imports us).
   */
  glassesCommand: (auth: Record<string, string>, body: { utterance: string; lat?: number; lng?: number }) =>
    backendFetch<GlassesDraft>('/glasses/command', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: auth,
    }),
  /**
   * Tell the server where this phone is (coarse, ~100 m) so the glasses/MCP flow can
   * pick the nearest place. Kept in memory for 30 minutes, only with location sharing on.
   */
  glassesLocation: (auth: Record<string, string>, point: { lat: number; lng: number }) =>
    backendFetch<{ stored: boolean }>('/glasses/location', {
      method: 'POST',
      body: JSON.stringify(point),
      headers: auth,
    }),
  /** Post the pending draft. Repeating it returns the same Move; 409 means "say it again". */
  glassesConfirm: (auth: Record<string, string>, draftId?: string | null) =>
    backendFetch<GlassesPosted>('/glasses/confirm', {
      method: 'POST',
      body: JSON.stringify({ draft_id: draftId ?? null }),
      headers: auth,
    }),
};
