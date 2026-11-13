import { Linking, Platform, Share } from 'react-native';

import { BACKEND_URL } from './backend';

/**
 * Connecting Muse (Meta AI) to Moves: the `/mcp` connector URL, the prompt
 * that hands Muse the URL and the user's token, and copy/open helpers.
 * Meta AI has no link that pre-fills a prompt, so the prompt is copied and
 * the user pastes it into Muse.
 */

// The public `/mcp` URL Muse calls. Must be reachable from the internet (a
// tunnel or deployed backend), so set EXPO_PUBLIC_MCP_URL for real use.
export const MCP_URL: string = (process.env.EXPO_PUBLIC_MCP_URL || `${BACKEND_URL}/mcp`).replace(/\/$/, '');

/** What "Open Muse" opens. */
export const MUSE_URL: string = process.env.EXPO_PUBLIC_MUSE_URL || 'https://www.meta.ai/';

/** False for localhost / LAN / plain-http URLs Muse's servers cannot reach. */
export function isPublicUrl(url: string): boolean {
  return /^https:\/\//.test(url) && !/\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url);
}

/** The prompt pasted into Muse: connector URL plus the user's bearer token. */
export function connectPrompt(token: string, url: string = MCP_URL): string {
  return [
    'Add a custom connector (remote MCP server) for my Moves app.',
    'Name: Moves',
    `URL: ${url}`,
    `Authentication: send the header "Authorization: Bearer ${token}"`,
    '',
    'Once it is connected, use the Moves tools to post Moves for me and pull up to friends\' Moves.',
    'Always draft first, read me the draft, and only post after I say yes.',
  ].join('\n');
}

type ClipboardModule = { setStringAsync: (text: string) => Promise<boolean> };

/**
 * expo-clipboard is loaded lazily: a dev build made before it was added has
 * no native module, and then we fall back to the share sheet (which has Copy).
 */
function clipboard(): ClipboardModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-clipboard') as ClipboardModule;
  } catch {
    return null;
  }
}

/** Copies `text`. Resolves 'copied', or 'shared' when it fell back to the share sheet. */
export async function copyText(text: string): Promise<'copied' | 'shared'> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return 'copied';
  }
  const native = clipboard();
  if (native) {
    try {
      await native.setStringAsync(text);
      return 'copied';
    } catch {
      // Native module missing at call time: share sheet below.
    }
  }
  await Share.share({ message: text });
  return 'shared';
}

export async function openMuse(): Promise<void> {
  await Linking.openURL(MUSE_URL);
}
