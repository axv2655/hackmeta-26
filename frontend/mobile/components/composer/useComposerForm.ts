import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import {
  loadComposer,
  museDraft,
  withPlaceFirst,
  type ComposerData,
  type FillMinutes,
  type Place,
  type Prefill,
} from '@/lib/composer';
import type { Category, MoveDraft, MuseSource } from '@/lib/types';

export type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ComposerData };

/** Muse's second (real) draft: writing, landed, or failed (the quick draft stays). */
export type MuseState = 'idle' | 'writing' | 'done' | 'failed';

function initialCircles(prefill: Prefill, data: ComposerData): string[] {
  if (prefill.circleIds.length || prefill.userIds.length) return prefill.circleIds;
  const known = new Set(data.circles.map((c) => c.id));
  return data.draft.circle_ids.filter((id) => known.has(id));
}

/**
 * All composer form state. Loads the instant heuristic draft, then asks Muse
 * for its real draft and swaps text, alternates and place in only where the
 * user has not touched them yet.
 */
export function useComposerForm(prefill: Prefill) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [text, setTextState] = useState('');
  const [alternates, setAlternates] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>('other');
  const [circleIds, setCircleIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [fill, setFill] = useState<FillMinutes>(prefill.fill);
  const [muse, setMuse] = useState<MuseState>('idle');
  const [draftSource, setDraftSource] = useState<MuseSource>('heuristic');
  const [confirmPlace, setConfirmPlace] = useState(false);
  const [edited, setEdited] = useState(Boolean(prefill.text));
  const textTouched = useRef(Boolean(prefill.text));
  const placeTouched = useRef(Boolean(prefill.markId));

  const applyMuse = useCallback(
    (d: MoveDraft) => {
      setDraftSource(d.source);
      if (!textTouched.current) {
        if (d.text) setTextState(d.text);
        setAlternates(d.alternates.slice(0, 3));
        if (!prefill.category) setCategory(d.category);
      }
      if (!placeTouched.current && d.mark) {
        const mark = d.mark;
        setPlaces((list) => withPlaceFirst(list, mark));
        setPlaceId(mark.id);
        setConfirmPlace(d.confirm_place);
      }
    },
    [prefill.category],
  );

  useEffect(() => {
    let live = true;
    setPhase({ kind: 'loading' });
    loadComposer(prefill).then(
      (data) => {
        if (!live) return;
        const d = data.draft;
        setPlaces(data.places);
        setPlaceId(prefill.markId && data.places.some((p) => p.id === prefill.markId) ? prefill.markId : d.mark?.id ?? data.places[0]?.id ?? null);
        setTextState(prefill.text ?? d.text);
        setAlternates(d.alternates.slice(0, 3));
        setCategory(prefill.category ?? d.category);
        setCircleIds(initialCircles(prefill, data));
        setUserIds(prefill.userIds);
        setDraftSource(d.source);
        setPhase({ kind: 'ready', data });
        if (data.sample) return;
        setMuse('writing');
        museDraft(prefill).then(
          (md) => {
            if (!live) return;
            applyMuse(md);
            setMuse('done');
          },
          () => live && setMuse('failed'),
        );
      },
      (e) => live && setPhase({ kind: 'error', message: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
  }, [attempt, prefill, applyMuse]);

  const setText = useCallback((t: string, typed: boolean) => {
    textTouched.current = true;
    setEdited(typed);
    setTextState(t);
  }, []);

  const confirmYes = useCallback(() => {
    placeTouched.current = true;
    setConfirmPlace(false);
  }, []);

  const choosePlace = useCallback((p: Place) => {
    placeTouched.current = true;
    setConfirmPlace(false);
    setPlaces((list) => (list.some((x) => x.id === p.id) ? list : withPlaceFirst(list, p)));
    setPlaceId(p.id);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const place = places.find((p) => p.id === placeId) ?? null;

  return {
    phase,
    retry,
    places,
    place,
    choosePlace,
    text,
    setText,
    edited,
    alternates,
    category,
    setCategory,
    circleIds,
    setCircleIds,
    userIds,
    setUserIds,
    open,
    setOpen,
    fill,
    setFill,
    muse,
    draftSource,
    confirmPlace,
    confirmYes,
  };
}

export type ComposerForm = ReturnType<typeof useComposerForm>;
