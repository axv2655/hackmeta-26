import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '@/lib/backend';
import { emptyComposer, loadComposer, museDraft, withPlaceFirst, type ComposerPart, type FillMinutes, type Place, type Prefill } from '@/lib/composer';
import { canApplyDraft, withDeadline } from '@/lib/composerLoading';
import type { Category, MoveDraft, MuseSource } from '@/lib/types';

export type MuseState = 'idle' | 'writing' | 'done' | 'failed';
const PARTS: ComposerPart[] = ['draft', 'places', 'friends', 'circles', 'crews'];

/** Editable immediately. Independent lists and the model publish in the background. */
export function useComposerForm(prefill: Prefill) {
  const [data, setData] = useState(() => emptyComposer(prefill));
  const [pending, setPending] = useState<ComposerPart[]>(PARTS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placeId, setPlaceId] = useState<string | null>(prefill.markId ?? null);
  const [text, setTextState] = useState(prefill.text ?? '');
  const [alternates, setAlternates] = useState<string[]>([]);
  const [category, setCategoryState] = useState<Category>(prefill.category ?? 'other');
  const [circleIds, setCircleIdsState] = useState(prefill.circleIds);
  const [userIds, setUserIdsState] = useState(prefill.userIds);
  const [open, setOpen] = useState(false);
  const [fill, setFill] = useState<FillMinutes>(prefill.fill);
  const [muse, setMuse] = useState<MuseState>('writing');
  const [draftSource, setDraftSource] = useState<MuseSource>('heuristic');
  const [confirmPlace, setConfirmPlace] = useState(false);
  const [edited, setEdited] = useState(Boolean(prefill.text));
  const touched = useRef({ text: Boolean(prefill.text), place: Boolean(prefill.markId), category: Boolean(prefill.category), audience: Boolean(prefill.circleIds.length || prefill.userIds.length) });
  const selectedId = useRef<string | null>(prefill.markId ?? null);
  const modelApplied = useRef(false);

  const mergePlaces = useCallback((rows: Place[]) => {
    setPlaces((old) => [...old, ...rows.filter((p) => !old.some((x) => x.id === p.id))]);
  }, []);

  const applyDraft = useCallback((d: MoveDraft, fromModel: boolean) => {
    const allowed = canApplyDraft(touched.current, selectedId.current, d.mark?.id ?? null, modelApplied.current, fromModel);
    if (allowed) {
      if (d.text) setTextState(d.text);
      setAlternates(d.alternates.slice(0, 3));
      setDraftSource(d.source);
      if (!touched.current.category) setCategoryState(d.category);
    }
    if (d.mark) mergePlaces([d.mark]);
    if (!touched.current.place && !(modelApplied.current && !fromModel) && d.mark) {
      selectedId.current = d.mark.id;
      setPlaceId(d.mark.id);
      setConfirmPlace(d.confirm_place);
    }
    // Audience defaults only come from the quick draft; a late model cannot widen it.
    if (!fromModel && !touched.current.audience) setCircleIdsState(d.circle_ids);
    if (fromModel && allowed) modelApplied.current = true;
  }, [mergePlaces]);

  useEffect(() => {
    let live = true;
    setPending(PARTS);
    setLoadError(null);
    setMuse('writing');
    loadComposer(prefill, (_part, value) => {
      if (!live) return;
      setData((old) => ({ ...old, ...value }));
      if (value.places) mergePlaces(value.places);
      if (value.draft) applyDraft(value.draft, false);
    }, (part) => {
      if (live) setPending((old) => old.filter((p) => p !== part));
    }).then((loaded) => {
      if (!live) return;
      setData(loaded);
      mergePlaces(loaded.places);
      if (loaded.sample) applyDraft(loaded.draft, false);
    }, (e) => live && setLoadError(errorMessage(e)));
    // Start alongside the quick draft and lists, never after their slowest response.
    withDeadline(museDraft(prefill), 25_000).then((draft) => {
      if (!live) return;
      applyDraft(draft, true);
      setMuse('done');
    }, () => live && setMuse('failed'));
    return () => { live = false; };
  }, [attempt, prefill, applyDraft, mergePlaces]);

  const setText = useCallback((value: string, typed: boolean) => {
    touched.current.text = true;
    setEdited(typed);
    setTextState(value);
  }, []);
  const setCategory = useCallback((value: Category) => {
    touched.current.category = true;
    setCategoryState(value);
  }, []);
  const setCircleIds = useCallback((ids: string[]) => {
    touched.current.audience = true;
    setCircleIdsState(ids);
  }, []);
  const setUserIds = useCallback((ids: string[]) => {
    touched.current.audience = true;
    setUserIdsState(ids);
  }, []);
  const confirmYes = useCallback(() => {
    touched.current.place = true;
    setConfirmPlace(false);
  }, []);
  const choosePlace = useCallback((p: Place) => {
    touched.current.place = true;
    selectedId.current = p.id;
    setConfirmPlace(false);
    setAlternates([]);
    setPlaces((list) => withPlaceFirst(list, p));
    setPlaceId(p.id);
  }, []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const place = places.find((p) => p.id === placeId) ?? null;

  return { data, pending, loadError, retry, places, place, choosePlace, text, setText, edited, alternates,
    category, setCategory, circleIds, setCircleIds, userIds, setUserIds, open, setOpen, fill, setFill,
    muse, draftSource, confirmPlace, confirmYes };
}

export type ComposerForm = ReturnType<typeof useComposerForm>;
