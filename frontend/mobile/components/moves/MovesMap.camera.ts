import { CAMPUS_CENTER } from '@/lib/mock/moves';

/** The map's home view, shared by the native (MovesMap.tsx) and web (MovesMap.web.tsx) maps. */
export const HOME_CAMERA = {
  // The Meta campus (Menlo Park): Hacker Square, MPK 20 and MPK 21 in view.
  center: CAMPUS_CENTER,
  pitch: 35,
  heading: 0,
  altitude: 6600,
  zoom: 14.1,
};
