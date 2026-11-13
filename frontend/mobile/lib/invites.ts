import { Share } from 'react-native';

import { api } from './session';

/**
 * Share a Move with friends who aren't in the group or don't have the app
 * (ARCHITECTURE.md 9.4). The backend makes a link to a no-login page; the
 * phone's share sheet sends it from the user's own number. No SMS service.
 *
 * Mirrors backend/app/api/routes/invites.py.
 */

export type Invite = {
  id: string;
  url: string;
  /** "Anish is making a move to Kumo Matcha. You want to pull up?" */
  text: string;
  /** `text`, a newline, then `url`: what the share sheet sends. */
  body: string;
  created_at: string;
  opened_at: string | null;
  open_count: number;
  guest_name: string | null;
  responded_at: string | null;
};

export const invitesApi = {
  create: (moveId: string, message?: string) =>
    api<Invite>(`/moves/${encodeURIComponent(moveId)}/invites`, {
      method: 'POST',
      body: JSON.stringify({ message: message || null }),
    }),
  list: (moveId: string) => api<Invite[]>(`/moves/${encodeURIComponent(moveId)}/invites`),
};

/** The same first line the backend writes, for the offline fallback. */
export function inviteText(inviterFirst: string, markName: string, creatorFirst?: string): string {
  const host = creatorFirst || inviterFirst;
  const line = `${host} is making a move to ${markName}. You want to pull up?`;
  return host === inviterFirst ? line : `${inviterFirst}: ${line}`;
}

export type ShareTarget = { moveId: string; markName: string; creatorFirst: string; inviterFirst: string };

/**
 * Get a link for this Move and open the share sheet. If the backend can't make
 * one (offline, or a mock Move it doesn't know), share the line on its own.
 * Resolves true when the user picked an app to send it with.
 */
export async function shareMove(target: ShareTarget): Promise<boolean> {
  let message: string;
  try {
    message = (await invitesApi.create(target.moveId)).body;
  } catch {
    message = inviteText(target.inviterFirst, target.markName, target.creatorFirst);
  }
  const result = await Share.share({ message });
  return result.action === Share.sharedAction;
}
