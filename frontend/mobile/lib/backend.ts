import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';

const PORT = 8000;

/** Wire format of a note, mirroring `NoteRead` in backend/app/models.py. */
export type Note = {
  id: string;
  title: string;
  body: string;
  created_at: string;
};

/** Mirrors `NoteCreate`. `body` defaults to an empty string server-side. */
export type NoteCreate = {
  title: string;
  body?: string;
};

export type HealthResponse = {
  status: 'ok';
};

export type BackendFetchOptions = NonNullable<Parameters<typeof fetch>[1]>;

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
 * Calls `${BACKEND_URL}/api/v1${path}`. JSON bodies get a Content-Type header
 * automatically. Resolves to the parsed JSON body, or `null` for a 204.
 * Rejects with the server's `detail` string (or "status statusText") on any
 * non-2xx response.
 */
export async function backendFetch<T = unknown>(path: string, options: BackendFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BACKEND_URL}/api/v1${path}`, { ...options, headers });
  if (!res.ok) {
    const detail: unknown = await res.json().then(
      (b: { detail?: unknown }) => b.detail,
      () => null,
    );
    throw new Error(typeof detail === 'string' ? detail : `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  health: () => backendFetch<HealthResponse>('/health'),
  listNotes: () => backendFetch<Note[]>('/notes'),
  createNote: (note: NoteCreate) => backendFetch<Note>('/notes', { method: 'POST', body: JSON.stringify(note) }),
  deleteNote: (id: string) => backendFetch<null>(`/notes/${id}`, { method: 'DELETE' }),
};
