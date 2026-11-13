/** Publish each result as it arrives; a slow optional list never hides the form. */
export async function loadParts<T extends object>(
  jobs: { [K in keyof T]: () => Promise<T[K]> },
  onPart: <K extends keyof T>(key: K, value: T[K]) => void,
  onSettled: (key: keyof T) => void,
  timeoutMs = 12_000,
): Promise<T> {
  const results = await Promise.allSettled((Object.keys(jobs) as (keyof T)[]).map(async (key) => {
    const value = await withDeadline(jobs[key](), timeoutMs).finally(() => onSettled(key));
    onPart(key, value);
    return [key, value] as const;
  }));
  const failed = results.find((r) => r.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
  const rows = results.flatMap((r) => r.status === 'fulfilled' ? [r.value] : []);
  return Object.fromEntries(rows) as T;
}

export function withDeadline<T>(request: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Taking too long. Tap retry to try again.')), timeoutMs);
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

/** Never let a late draft replace typing, a different chosen place, or a newer AI draft. */
export function canApplyDraft(
  touched: { text: boolean; place: boolean },
  selectedPlaceId: string | null,
  draftPlaceId: string | null,
  modelApplied: boolean,
  fromModel: boolean,
): boolean {
  return !touched.text && !(modelApplied && !fromModel)
    && !(touched.place && selectedPlaceId !== draftPlaceId);
}
