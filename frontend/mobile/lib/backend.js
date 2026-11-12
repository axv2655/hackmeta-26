import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';

const PORT = 8000;

// With no EXPO_PUBLIC_BACKEND_URL, aim at the machine serving the Expo bundle.
// On a phone that is the laptop's LAN IP (taken from the dev server's
// hostUri), so the backend has to listen on 0.0.0.0 rather than 127.0.0.1.
function defaultBase() {
  if (Platform.OS === 'web') return `${window.location.protocol}//${window.location.hostname}:${PORT}`;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:${PORT}`;
}

// Expo statically substitutes EXPO_PUBLIC_* values into native release builds.
export const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || defaultBase()).replace(/\/$/, '');

export async function backendFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${BACKEND_URL}/api/v1${path}`, { ...options, headers });
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null);
    throw new Error(typeof detail === 'string' ? detail : `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => backendFetch('/health'),
  listNotes: () => backendFetch('/notes'),
  createNote: (note) => backendFetch('/notes', { method: 'POST', body: JSON.stringify(note) }),
  deleteNote: (id) => backendFetch(`/notes/${id}`, { method: 'DELETE' }),
};
