import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';

import type { Category, MoveDraft, MoveOrigin } from './types';

/**
 * Navigation helpers shared by every surface: where a notification, banner or
 * push goes (`routeFor`), and the one param contract for opening the composer.
 */

const KNOWN_ROUTES: RegExp[] = [
  /^\/move\/[^/]+$/,
  /^\/move\/[^/]+\/rate$/,
  /^\/move\/[^/]+\/moments$/,
  /^\/suggestion\/[^/]+$/,
  /^\/user\/[^/]+$/,
  /^\/friends$/,
  /^\/moves$/,
  /^\/notifications$/,
];

const seg = encodeURIComponent;

function mapRoute(route: string, type?: string): string | null {
  const path = route.split('?')[0];
  if (path === '/notifications' && type?.startsWith('friend_')) return '/friends';
  return KNOWN_ROUTES.some((r) => r.test(path)) ? path : null;
}

/**
 * Where a notification-like payload opens. Precedence: `data.route` (when it
 * is a known route; `/notifications` for `friend_*` becomes `/friends`), then
 * `suggestion_id`, `moment_id` + `move_id` (Moments), `rate_move` (rate),
 * `move_id`, `user_id`. Null when nothing applies.
 */
export function routeFor(data?: Record<string, string>, type?: string): Href | null {
  if (!data) return null;
  const mapped = data.route ? mapRoute(data.route, type) : null;
  if (mapped) return mapped as Href;
  if (data.suggestion_id) return `/suggestion/${seg(data.suggestion_id)}` as Href;
  if (data.moment_id && data.move_id) return `/move/${seg(data.move_id)}/moments` as Href;
  if (type === 'rate_move' && data.move_id) return `/move/${seg(data.move_id)}/rate` as Href;
  if (data.move_id) return `/move/${seg(data.move_id)}` as Href;
  if (data.user_id) return `/user/${seg(data.user_id)}` as Href;
  return null;
}

/** `router.push(routeFor(...))`; does nothing when there is no target. */
export function useOpenTarget(): (data?: Record<string, string>, type?: string) => void {
  const router = useRouter();
  return useCallback(
    (data?: Record<string, string>, type?: string) => {
      const href = routeFor(data, type);
      if (href) router.push(href);
    },
    [router],
  );
}

/** Params for `/move/new`. Lists are comma separated. */
export type ComposerParams = {
  mark_id?: string;
  text?: string;
  seed_text?: string;
  category?: Category;
  /** csv */
  circle_ids?: string;
  /** csv */
  user_ids?: string;
  kind?: 'move' | 'flare';
  fill_minutes?: string;
  origin?: MoveOrigin;
  origin_ref?: string;
};

export function composerHref(p: ComposerParams): Href {
  const params = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ''));
  return { pathname: '/move/new', params } as Href;
}

/** A Muse draft as composer params, tagged with where it came from. */
export function draftToComposer(d: MoveDraft, origin: MoveOrigin, originRef?: string): ComposerParams {
  return {
    mark_id: d.mark?.id,
    text: d.text || undefined,
    category: d.category,
    circle_ids: d.circle_ids.length ? d.circle_ids.join(',') : undefined,
    user_ids: d.user_ids.length ? d.user_ids.join(',') : undefined,
    kind: d.kind,
    fill_minutes: d.fill_minutes == null ? undefined : String(d.fill_minutes),
    origin,
    origin_ref: originRef,
  };
}

// Dev-only self-check of every route form in the API contract (no test runner exists).
if (__DEV__) {
  const cases: [Record<string, string>, string | undefined, string | null][] = [
    [{ route: '/move/mv_1' }, undefined, '/move/mv_1'],
    [{ route: '/move/mv_1/rate', move_id: 'mv_1' }, 'rate_move', '/move/mv_1/rate'],
    [{ route: '/move/mv_1/moments', moment_id: 'mo_1', move_id: 'mv_1' }, 'moment_approval', '/move/mv_1/moments'],
    [{ route: '/suggestion/sg_1', suggestion_id: 'sg_1' }, 'muse_flare', '/suggestion/sg_1'],
    [{ route: '/friends' }, 'friend_request', '/friends'],
    [{ route: '/user/u_tony', user_id: 'u_tony' }, 'friend_accepted', '/user/u_tony'],
    [{ route: '/moves' }, undefined, '/moves'],
    [{ route: '/notifications' }, undefined, '/notifications'],
    [{ route: '/notifications' }, 'friend_request', '/friends'],
    [{ route: '/unknown/x', move_id: 'mv_2' }, undefined, '/move/mv_2'],
    [{ suggestion_id: 'sg_2' }, undefined, '/suggestion/sg_2'],
    [{ moment_id: 'mo_2', move_id: 'mv_3' }, undefined, '/move/mv_3/moments'],
    [{ move_id: 'mv_4' }, 'rate_move', '/move/mv_4/rate'],
    [{ move_id: 'mv_5' }, 'move_invite', '/move/mv_5'],
    [{ user_id: 'u_priya' }, undefined, '/user/u_priya'],
    [{}, undefined, null],
  ];
  for (const [data, type, want] of cases) {
    const got = routeFor(data, type);
    if (got !== want) console.warn(`routeFor(${JSON.stringify(data)}, ${type}) = ${String(got)}, expected ${want}`);
  }
}
