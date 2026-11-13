import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';

const PORT = 8000;

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
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
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
