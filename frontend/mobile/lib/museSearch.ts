import { create } from 'zustand';

import { ApiError, errorMessage } from '@/lib/backend';
import { coarseHere } from '@/lib/composer';
import { endpoints } from '@/lib/endpoints';
import { appEvents } from '@/lib/events';
import { onLogout, useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import type { MuseSearchDraftBody, MuseSearchRequest, MuseSearchResult } from '@/lib/types';

/**
 * The map's prompt box (docs/MUSE_SEARCH.md). Muse only runs when the user
 * asks; nothing is posted until they tap Send on a draft (rule 6), so there is
 * nothing optimistic to roll back here.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** The call that produced the current result, kept for Retry and clarify follow-ups. */
type LastRequest = { via: 'search'; body: MuseSearchRequest } | { via: 'draft'; body: MuseSearchDraftBody };

export const MAX_PROMPT = 300;
/** The server's cap on people per draft. */
const MAX_PEOPLE = 8;

type MuseSearchState = {
  /** What the user typed (plus any free-text clarify replies). */
  prompt: string;
  status: Status;
  result: MuseSearchResult | null;
  error: string | null;
  /** True while Send is posting the draft. */
  posting: boolean;
  last: LastRequest | null;
  ask: (text: string) => Promise<void>;
  /** Answer a "Which Div?" clarify: same text, `picks[name] = userId`. */
  pickPerson: (name: string, userId: string) => Promise<void>;
  /** Answer a place clarify: same request with `mark_id`. */
  pickPlace: (markId: string) => Promise<void>;
  /** Free-text reply to a clarify question: `original + ". " + reply`. */
  reply: (text: string) => Promise<void>;
  /** Draft a Move from a tapped people set or place (no Muse call). */
  draftFrom: (pick: { user_ids: string[]; mark_id?: string | null }) => Promise<void>;
  /** Re-runs the last call after an error. */
  retry: () => Promise<void>;
  /** Posts the held draft. Resolves true when the Move went out. */
  confirm: () => Promise<boolean>;
  clear: () => void;
};

const initial = {
  prompt: '',
  status: 'idle' as Status,
  result: null,
  error: null,
  posting: false,
  last: null,
};

/** Bumped on every call and on clear, so a late answer never overwrites a newer one. */
let seq = 0;

const clip = (text: string): string => text.trim().slice(0, MAX_PROMPT);

/** Fills arrays the server may leave out, so the UI never reads `undefined.map`. */
function normalize(r: MuseSearchResult): MuseSearchResult {
  return {
    ...r,
    message: r.message ?? '',
    text: r.text ?? '',
    draft: r.draft ?? null,
    people: r.people ?? [],
    places: r.places ?? [],
    clarify: r.clarify ?? null,
  };
}

function send(last: LastRequest): Promise<MuseSearchResult> {
  if (last.via === 'draft') return endpoints.muse.searchDraft({ ...last.body, ...coarseHere() });
  return endpoints.muse.search({ ...last.body, ...coarseHere() });
}

function searchBody(text: string, prev: LastRequest | null): MuseSearchRequest {
  const body = prev?.via === 'search' ? prev.body : null;
  return { text: clip(text), picks: body?.picks, mark_id: body?.mark_id ?? null };
}

export const useMuseSearch = create<MuseSearchState>()((set, get) => {
  const run = async (last: LastRequest): Promise<void> => {
    if (!useSession.getState().userId) return;
    const mine = ++seq;
    set({ status: 'loading', error: null, last });
    try {
      const result = normalize(await send(last));
      if (mine === seq) set({ status: 'ready', result, error: null });
    } catch (e) {
      if (mine === seq) set({ status: 'error', error: errorMessage(e) });
    }
  };

  return {
    ...initial,
    ask: async (text) => {
      const prompt = clip(text);
      if (!prompt) return;
      set({ prompt, result: null });
      await run({ via: 'search', body: { text: prompt, picks: undefined, mark_id: null } });
    },
    pickPerson: async (name, userId) => {
      const body = searchBody(get().prompt, get().last);
      await run({ via: 'search', body: { ...body, picks: { ...(body.picks ?? {}), [name]: userId } } });
    },
    pickPlace: async (markId) => {
      const last = get().last;
      if (last?.via === 'draft') return run({ via: 'draft', body: { ...last.body, mark_id: markId } });
      await run({ via: 'search', body: { ...searchBody(get().prompt, last), mark_id: markId } });
    },
    reply: async (text) => {
      const answer = text.trim();
      if (!answer) return;
      const prompt = clip(get().prompt ? `${get().prompt}. ${answer}` : answer);
      set({ prompt });
      await run({ via: 'search', body: searchBody(prompt, get().last) });
    },
    draftFrom: async ({ user_ids, mark_id }) => {
      const text = get().result?.text || get().prompt;
      if (!text) return;
      await run({ via: 'draft', body: { text, user_ids: user_ids.slice(0, MAX_PEOPLE), mark_id: mark_id ?? null } });
    },
    retry: async () => {
      const last = get().last;
      if (last) await run(last);
    },
    confirm: async () => {
      const draft = get().result?.draft;
      if (!draft || get().posting) return false;
      set({ posting: true });
      try {
        const posted = await endpoints.muse.searchConfirm({ draft_id: draft.draft_id });
        get().clear();
        toast(`Move posted: ${posted.text || draft.text}`);
        appEvents.emit('moves.changed', { move_id: posted.move_id });
        return true;
      } catch (e) {
        const expired = e instanceof ApiError && e.status === 409;
        set({ posting: false });
        if (expired) set({ status: 'error', error: 'That draft expired. Try again for a fresh one.' });
        else toast(errorMessage(e));
        return false;
      }
    },
    clear: () => {
      seq += 1;
      set(initial);
    },
  };
});

/** True when the prompt box should treat new text as a reply to Muse's question. */
export const awaitingReply = (s: Pick<MuseSearchState, 'status' | 'result'>): boolean =>
  s.status === 'ready' && s.result?.kind === 'clarify';

onLogout(() => {
  seq += 1;
  useMuseSearch.setState(initial);
});
