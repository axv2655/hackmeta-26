import type { IconName } from '@/components/ui/Icon';

import type { BitmojiPose } from './bitmoji';
import type { User } from './types';
import { currentUser, dev, dhivyesh, jordan, maya, priya, tony } from './users';

/**
 * Offline stand-in Moves around the Meta campus (Menlo Park, CA) for the Moves map.
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
  /** "Meta campus", "Menlo Park". */
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
  /** Posted by the signed-in user (backend Moves). */
  mine?: boolean;
  /** The signed-in user tapped Pull up (or is there). */
  going?: boolean;
  /** Muse's ranking reason, when it gave one. */
  reason?: string;
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
  library: { id: 'mk-library', name: 'MPK 21 Study Lounge', category: 'study', area: 'Meta campus', coordinate: { latitude: 37.4811, longitude: -122.1591 } },
  activity: { id: 'mk-activity', name: 'Arrillaga Rec Center', category: 'gym', area: 'Menlo Park', coordinate: { latitude: 37.4531, longitude: -122.1779 } },
  kumo: { id: 'mk-kumo', name: 'Kumo Matcha', category: 'coffee', area: 'Belle Haven', coordinate: { latitude: 37.4727, longitude: -122.1547 } },
  plinth: { id: 'mk-plinth', name: 'Hacker Square', category: 'music', area: 'Meta campus', coordinate: { latitude: 37.485, longitude: -122.1482 } },
  cityline: { id: 'mk-cityline', name: 'Stanford Shopping Center', category: 'shopping', area: 'Palo Alto', coordinate: { latitude: 37.4432, longitude: -122.1709 } },
  pho: { id: 'mk-pho', name: 'Pho City', category: 'food', area: 'Menlo Park', coordinate: { latitude: 37.4542, longitude: -122.1628 } },
  northside: { id: 'mk-northside', name: 'MPK 20 Rooftop Garden', category: 'party', area: 'Meta campus', coordinate: { latitude: 37.481, longitude: -122.1542 } },
} satisfies Record<string, Mark>;

/** The current user's own position (on-device only). */
export const myPosition: Coordinate = { latitude: 37.4832, longitude: -122.1503 };

export const mapMoves: MapMove[] = [
  {
    id: 'mv-1',
    user: maya,
    title: 'Locking in at MPK 21, come suffer with me',
    mark: marks.library,
    status: 'there',
    pose: 'study',
    timeLabel: '18 m',
    joined: [priya],
    distanceLabel: '0.5 mi',
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
    distanceLabel: '2.6 mi',
  },
  {
    id: 'mv-3',
    user: dev,
    title: 'Jamming in Hacker Square, bring a guitar',
    mark: marks.plinth,
    status: 'there',
    pose: 'music',
    timeLabel: '25 m',
    joined: [dhivyesh, jordan],
    distanceLabel: '0.2 mi',
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
    distanceLabel: '0.8 mi',
  },
  {
    id: 'mv-5',
    user: jordan,
    title: 'Shopping run at Stanford Shopping Center',
    mark: marks.cityline,
    status: 'there',
    pose: 'strut',
    timeLabel: '40 m',
    joined: [],
    distanceLabel: '3.0 mi',
  },
  {
    id: 'mv-6',
    user: dhivyesh,
    title: 'Rooftop hang on MPK 20 tonight',
    mark: marks.northside,
    status: 'ghost',
    pose: 'dance',
    timeLabel: '9 h',
    joined: [maya, tony],
    distanceLabel: '0.3 mi',
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
    distanceLabel: '2.1 mi',
  },
];

export const me = currentUser;

export function getMapMove(id: string): MapMove | undefined {
  return mapMoves.find((m) => m.id === id);
}
