import type { IconName } from '@/components/ui/Icon';

import type { BitmojiPose } from './bitmoji';
import type { User } from './types';
import { currentUser, dev, dhivyesh, jordan, maya, priya, tony } from './users';

/**
 * Seeded Moves around UT Dallas (Richardson, TX) for the Moves map.
 *
 * Privacy rule (ARCHITECTURE.md 1.5.2): a friend's avatar is pinned to the
 * Mark (the place) of their Move, never to their GPS position. Only the
 * current user's own "Me now" pin sits at their own position, and it is
 * drawn on their device only.
 */

export type MoveCategory = 'coffee' | 'study' | 'gym' | 'party' | 'music' | 'food' | 'shopping';

/** there = at the Mark now, omw = pulling up, ghost = left within the last 24 h. */
export type MoveStatus = 'there' | 'omw' | 'ghost';

export type Coordinate = { latitude: number; longitude: number };

export type Mark = {
  id: string;
  name: string;
  category: MoveCategory;
  coordinate: Coordinate;
  /** "Campus", "Richardson". */
  area: string;
};

export type MapMove = {
  id: string;
  user: User;
  /** What they are doing, in their words: "Matcha + grinding a PSET". */
  title: string;
  mark: Mark;
  status: MoveStatus;
  pose: BitmojiPose;
  /** "12 m", "1 h". */
  timeLabel: string;
  /** Friends already there or on the way, besides the poster. */
  joined: User[];
  /** Distance from the current user, formatted: "0.4 mi". */
  distanceLabel: string;
};

export const CATEGORY_META: Record<MoveCategory, { label: string; icon: IconName; color: string }> = {
  coffee: { label: 'Coffee', icon: 'coffee', color: '#A0612B' },
  study: { label: 'Study', icon: 'graduation', color: '#0866FF' },
  gym: { label: 'Gym', icon: 'dumbbell', color: '#1F9D55' },
  party: { label: 'Party', icon: 'party', color: '#8B3DFF' },
  music: { label: 'Music', icon: 'music', color: '#E4405F' },
  food: { label: 'Food', icon: 'utensils', color: '#F5761A' },
  shopping: { label: 'Shopping', icon: 'store', color: '#D6338A' },
};

const marks = {
  library: { id: 'mk-library', name: 'McDermott Library', category: 'study', area: 'Campus', coordinate: { latitude: 32.98665, longitude: -96.74762 } },
  activity: { id: 'mk-activity', name: 'Activity Center', category: 'gym', area: 'Campus', coordinate: { latitude: 32.98395, longitude: -96.75085 } },
  kumo: { id: 'mk-kumo', name: 'Kumo Matcha', category: 'coffee', area: 'Richardson', coordinate: { latitude: 32.99052, longitude: -96.73958 } },
  plinth: { id: 'mk-plinth', name: 'The Plinth', category: 'music', area: 'Campus', coordinate: { latitude: 32.98905, longitude: -96.75015 } },
  cityline: { id: 'mk-cityline', name: 'CityLine Plaza', category: 'shopping', area: 'Richardson', coordinate: { latitude: 32.99805, longitude: -96.70315 } },
  pho: { id: 'mk-pho', name: 'Pho Bang', category: 'food', area: 'Richardson', coordinate: { latitude: 32.96845, longitude: -96.73095 } },
  northside: { id: 'mk-northside', name: 'Northside Rooftop', category: 'party', area: 'Campus', coordinate: { latitude: 32.99042, longitude: -96.75281 } },
} satisfies Record<string, Mark>;

/** The current user's own position (on-device only). */
export const myPosition: Coordinate = { latitude: 32.98265, longitude: -96.74355 };

export const mapMoves: MapMove[] = [
  {
    id: 'mv-1',
    user: maya,
    title: 'Grinding the orgo PSET, come suffer with me',
    mark: marks.library,
    status: 'there',
    pose: 'study',
    timeLabel: '18 m',
    joined: [priya],
    distanceLabel: '0.3 mi',
  },
  {
    id: 'mv-2',
    user: tony,
    title: 'Leg day. Need a spotter',
    mark: marks.activity,
    status: 'there',
    pose: 'gym',
    timeLabel: '6 m',
    joined: [],
    distanceLabel: '0.4 mi',
  },
  {
    id: 'mv-3',
    user: dev,
    title: 'Open mic at the Plinth, bring a guitar',
    mark: marks.plinth,
    status: 'there',
    pose: 'music',
    timeLabel: '25 m',
    joined: [dhivyesh, jordan],
    distanceLabel: '0.5 mi',
  },
  {
    id: 'mv-4',
    user: priya,
    title: 'Matcha run, anyone?',
    mark: marks.kumo,
    status: 'omw',
    pose: 'walk',
    timeLabel: '2 m',
    joined: [],
    distanceLabel: '0.6 mi',
  },
  {
    id: 'mv-5',
    user: jordan,
    title: 'Thrifting at CityLine',
    mark: marks.cityline,
    status: 'there',
    pose: 'strut',
    timeLabel: '40 m',
    joined: [],
    distanceLabel: '2.4 mi',
  },
  {
    id: 'mv-6',
    user: dhivyesh,
    title: 'Rooftop hang tonight',
    mark: marks.northside,
    status: 'ghost',
    pose: 'dance',
    timeLabel: '9 h',
    joined: [maya, tony],
    distanceLabel: '0.6 mi',
  },
  {
    id: 'mv-7',
    user: maya,
    title: 'Late pho',
    mark: marks.pho,
    status: 'ghost',
    pose: 'snack',
    timeLabel: '14 h',
    joined: [dev],
    distanceLabel: '1.3 mi',
  },
];

export const me = currentUser;

export function getMapMove(id: string): MapMove | undefined {
  return mapMoves.find((m) => m.id === id);
}
