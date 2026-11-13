import { requireOptionalNativeModule } from 'expo';
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

type NativeClipboard = {
  setStringAsync?: (text: string, options: { inputFormat: 'plainText' }) => Promise<boolean>;
};

/**
 * The native clipboard, or null when this build doesn't include it (a dev
 * build made before expo-clipboard was added). Looked up optionally instead of
 * importing expo-clipboard, whose import throws when the module is missing.
 */
function nativeClipboard(): NativeClipboard | null {
  try {
    return requireOptionalNativeModule<NativeClipboard>('ExpoClipboard');
  } catch {
    return null;
  }
}

async function tryClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
      await navigator.clipboard.writeText(text);
      return true;
    }
    const native = nativeClipboard();
    if (!native?.setStringAsync) return false;
    await native.setStringAsync(text, { inputFormat: 'plainText' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies `text`. Never throws: 'copied', 'shared' when it fell back to the
 * share sheet (which has Copy), or 'failed' when neither worked.
 */
export async function copyText(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (await tryClipboard(text)) return 'copied';
  try {
    await Share.share({ message: text });
    return 'shared';
  } catch {
    return 'failed';
  }
}

export async function openMuse(): Promise<void> {
  await Linking.openURL(MUSE_URL);
}
