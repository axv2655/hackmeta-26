import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

import { ApiError, errorMessage } from './backend';
import { endpoints } from './endpoints';
import { appEvents } from './events';
import { onLogout } from './session';
import { CATEGORIES } from './types';
import type {
  Category,
  LeaderboardSpot,
  MuseMark,
  MyListRow,
  RatingAnswer,
  RatingFace,
  RatingQuestions,
  RatingResult,
  Taste,
} from './types';

/** Pairwise questions asked at most per rating (the rest settle at the midpoint server-side). */
export const MAX_COMPARISONS = 3;

/** `?category=` param -> a known Category, or undefined for "All". */
export function parseCategory(raw: unknown): Category | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && (CATEGORIES as string[]).includes(v) ? (v as Category) : undefined;
}

/** "8.4" style score text. */
export function scoreText(score: number): string {
  return (Math.round(score * 10) / 10).toFixed(1);
}

// --- Leaderboards store -----------------------------------------------------

export type BoardTab = 'spots' | 'mine';
type Status = 'idle' | 'loading' | 'ready' | 'error';

export type BoardEntry<T> = { rows: T[]; status: Status; error: string | null };

type BoardsState = {
  spots: Record<string, BoardEntry<LeaderboardSpot>>;
  mine: Record<string, BoardEntry<MyListRow>>;
  load(tab: BoardTab, category?: Category): Promise<void>;
  invalidate(): void;
};

const EMPTY: BoardEntry<never> = { rows: [], status: 'idle', error: null };

export function boardKey(category?: Category): string {
  return category ?? 'all';
}

export const useLeaderboards = create<BoardsState>()((set, get) => ({
  spots: {},
  mine: {},
  async load(tab, category) {
    const key = boardKey(category);
    const prev = get()[tab][key] ?? EMPTY;
    set((s) => ({ [tab]: { ...s[tab], [key]: { ...prev, status: 'loading', error: null } } }) as Partial<BoardsState>);
    try {
      const rows =
        tab === 'spots' ? await endpoints.leaderboards.spots(category) : await endpoints.leaderboards.myList(category);
      set((s) => ({ [tab]: { ...s[tab], [key]: { rows, status: 'ready', error: null } } }) as Partial<BoardsState>);
    } catch (e) {
      set(
        (s) =>
          ({ [tab]: { ...s[tab], [key]: { ...prev, status: 'error', error: errorMessage(e) } } }) as Partial<BoardsState>,
      );
    }
  },
  invalidate() {
    set({ spots: {}, mine: {} });
  },
}));

onLogout(() => useLeaderboards.getState().invalidate());

/** The cached board for a tab and category (idle until loaded). */
export function useBoard(tab: 'spots', category?: Category): BoardEntry<LeaderboardSpot>;
export function useBoard(tab: 'mine', category?: Category): BoardEntry<MyListRow>;
export function useBoard(tab: BoardTab, category?: Category): BoardEntry<LeaderboardSpot | MyListRow> {
  return useLeaderboards((s) => s[tab][boardKey(category)] ?? EMPTY);
}

// --- Rate flow --------------------------------------------------------------

export type RateStep =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; restart: boolean }
  | { kind: 'already' }
  | { kind: 'not_allowed' }
  | { kind: 'face' }
  | { kind: 'compare'; other: MuseMark; asking: boolean }
  | { kind: 'vibes'; submitting: boolean }
  | { kind: 'result'; result: RatingResult; taste: Taste | null };

export type RateFlow = {
  step: RateStep;
  questions: RatingQuestions | null;
  face: RatingFace | null;
  answers: RatingAnswer[];
  tags: string[];
  note: string;
  reload(): void;
  pickFace(face: RatingFace): void;
  answer(preferred: RatingAnswer['preferred']): void;
  skipCompare(): void;
  toggleTag(tag: string): void;
  setNote(note: string): void;
  submit(): void;
};

function submitError(e: unknown): RateStep {
  if (e instanceof ApiError && e.status === 403) return { kind: 'not_allowed' };
  if (e instanceof ApiError && e.status === 409) return { kind: 'already' };
  if (e instanceof ApiError && e.status === 422) {
    return { kind: 'error', message: 'Your list changed while you were ranking. Start again.', restart: true };
  }
  return { kind: 'error', message: errorMessage(e), restart: false };
}

function loadError(e: unknown): RateStep {
  if (e instanceof ApiError && e.status === 404) {
    return { kind: 'error', message: "This Move isn't available to you.", restart: true };
  }
  return { kind: 'error', message: errorMessage(e), restart: true };
}

/** Taste from the result, else one read of `/me/taste` (the taste agent may land a moment later). */
async function tasteFor(result: RatingResult): Promise<Taste | null> {
  if (result.taste?.summary) return result.taste;
  try {
    const t = await endpoints.muse.taste();
    return t?.summary ? t : null;
  } catch {
    return null;
  }
}

/** Questions -> face -> up to 3 pairwise answers -> vibes + note -> submit -> result. */
export function useRateFlow(moveId: string): RateFlow {
  const [step, setStep] = useState<RateStep>({ kind: 'loading' });
  const [questions, setQuestions] = useState<RatingQuestions | null>(null);
  const [face, setFace] = useState<RatingFace | null>(null);
  const [answers, setAnswers] = useState<RatingAnswer[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const reload = useCallback(() => {
    setStep({ kind: 'loading' });
    setFace(null);
    setAnswers([]);
    setTags([]);
    setNote('');
    endpoints.ratings.questions(moveId).then(
      (q) => {
        if (!alive.current) return;
        setQuestions(q);
        setStep(q.already_rated ? { kind: 'already' } : { kind: 'face' });
      },
      (e) => alive.current && setStep(loadError(e)),
    );
  }, [moveId]);

  useEffect(() => {
    if (moveId) reload();
  }, [moveId, reload]);

  const pickFace = useCallback(
    (f: RatingFace) => {
      setFace(f);
      const first = questions?.first_comparison;
      setStep(first ? { kind: 'compare', other: first, asking: false } : { kind: 'vibes', submitting: false });
    },
    [questions],
  );

  const answer = useCallback(
    (preferred: RatingAnswer['preferred']) => {
      if (step.kind !== 'compare' || step.asking) return;
      const next = [...answers, { other_mark_id: step.other.id, preferred }];
      setAnswers(next);
      if (next.length >= MAX_COMPARISONS) {
        setStep({ kind: 'vibes', submitting: false });
        return;
      }
      setStep({ ...step, asking: true });
      endpoints.ratings.next(moveId, next).then(
        (r) => {
          if (!alive.current) return;
          setStep(
            r.next_comparison
              ? { kind: 'compare', other: r.next_comparison, asking: false }
              : { kind: 'vibes', submitting: false },
          );
        },
        // The answers so far are still valid; the server settles the rest.
        () => alive.current && setStep({ kind: 'vibes', submitting: false }),
      );
    },
    [answers, moveId, step],
  );

  const skipCompare = useCallback(() => setStep({ kind: 'vibes', submitting: false }), []);

  const toggleTag = useCallback(
    (tag: string) => setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag])),
    [],
  );

  const submit = useCallback(() => {
    if (!face) return;
    setStep({ kind: 'vibes', submitting: true });
    endpoints.ratings
      .submit(moveId, { face, answers, vibe_tags: tags, note: note.trim() })
      .then(async (result) => {
        useLeaderboards.getState().invalidate();
        appEvents.emit('ratings.changed', { move_id: moveId, mark_id: result.mark.id });
        const taste = await tasteFor(result);
        if (alive.current) setStep({ kind: 'result', result, taste });
      })
      .catch((e) => alive.current && setStep(submitError(e)));
  }, [answers, face, moveId, note, tags]);

  return { step, questions, face, answers, tags, note, reload, pickFace, answer, skipCompare, toggleTag, setNote, submit };
}
