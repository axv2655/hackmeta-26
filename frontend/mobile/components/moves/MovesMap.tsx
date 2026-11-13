import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';

import { categoryMeta } from '@/lib/categories';
import { selection } from '@/lib/haptics';
import { moveMeta } from '@/lib/live';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import { here, useLocation } from '@/lib/location';
import { CAMPUS_CENTER, type Coordinate, type MapMove } from '@/lib/mock/moves';
import { useSaved } from '@/lib/saved';
import { useSession } from '@/lib/session';

import { AvatarPin, SavedPin } from './AvatarPin';

export type MovesMapHandle = {
  focus: (coordinate: Coordinate, zoomedIn?: boolean) => void;
  recenter: () => void;
};

export type MovesMapProps = {
  moves: MapMove[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  /** Bottom space covered by the sheet, so centering and the legal label clear it. */
  bottomPadding: number;
  topPadding: number;
  /** The map's center once a pan or zoom settles (for the city name). */
  onCenterChange?: (center: Coordinate) => void;
};

export const HOME_CAMERA = {
  // The Meta campus (Menlo Park): Hacker Square, MPK 20 and MPK 21 in view.
  center: CAMPUS_CENTER,
  pitch: 35,
  heading: 0,
  altitude: 6600,
  zoom: 14.1,
};

/** The user ids already at a live Move (not the poster): the pin's avatar trail. */
function trailOf(m: MapMove): string[] {
  if (m.status === 'ghost') return [];
  return (m.participants ?? []).filter((p) => p.status === 'there' && p.user.id !== m.user.id).map((p) => p.user.id);
}

function statusDetail(m: MapMove): string {
  if (m.status === 'omw') return 'on the way';
  if (m.status === 'ghost') return `${m.timeLabel} ago`;
  return m.mark.name;
}

/**
 * Full-screen Apple map with Bitmoji pins. Friends are pinned at the Mark of
 * their Move (never GPS); the current user's "Me now" pin is local only.
 */
export const MovesMap = forwardRef<MovesMapHandle, MovesMapProps>(function MovesMap(
  { moves, selectedId, onSelect, onClear, bottomPadding, topPadding, onCenterChange },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const router = useRouter();
  const myId = useSession((st) => st.userId);
  // The phone's own position (never sent anywhere). No fix, no "Me" pin.
  const me = useLocation((st) => st.coords);
  const savedMarks = useSaved((st) => st.marks);
  // Saved Marks without a Move pin on them get a bookmark pin.
  const savedPins = useMemo(() => {
    const pinned = new Set(moves.map((m) => m.mark.id));
    return savedMarks.map((s) => s.mark).filter((mk) => !pinned.has(mk.id));
  }, [moves, savedMarks]);

  useImperativeHandle(ref, () => ({
    focus: (coordinate, zoomedIn = true) => {
      mapRef.current?.animateCamera(
        // Aim a little south of the pin so it lands in the open map above
        // the half-height sheet (mapPadding only updates after it settles).
        { center: zoomedIn ? { ...coordinate, latitude: coordinate.latitude - 0.0016 } : coordinate, pitch: 50, altitude: zoomedIn ? 1100 : HOME_CAMERA.altitude, zoom: zoomedIn ? 16.2 : HOME_CAMERA.zoom },
        { duration: 650 },
      );
    },
    recenter: () => {
      mapRef.current?.animateCamera({ ...HOME_CAMERA, center: here() }, { duration: 650 });
    },
  }));

  // Ghosts first so live pins draw on top of them.
  const ordered = [...moves].sort((a, b) => Number(b.status === 'ghost') - Number(a.status === 'ghost'));

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialCamera={{ ...HOME_CAMERA, center: here() }}
      showsPointsOfInterests={false}
      showsBuildings
      pitchEnabled
      showsCompass={false}
      showsUserLocation={false}
      toolbarEnabled={false}
      mapPadding={{ top: topPadding, bottom: bottomPadding, left: 0, right: 0 }}
      onRegionChangeComplete={(region) => onCenterChange?.({ latitude: region.latitude, longitude: region.longitude })}
      onPress={(e) => {
        // Marker taps also bubble a map press on iOS; only clear on empty map.
        if (e.nativeEvent.action !== 'marker-press') onClear();
      }}
    >
      {ordered.map((m) => (
        <Marker
          key={m.id}
          identifier={m.id}
          coordinate={m.mark.coordinate}
          anchor={{ x: 0.5, y: 0.8 }}
          displayPriority="required"
          zIndex={m.id === selectedId ? 10 : m.status === 'ghost' ? 0 : 1}
          onPress={() => onSelect(m.id)}
        >
          <AvatarPin
            image={bitmojiFor(m.user.id, m.pose)}
            name={m.mine ? 'You' : m.user.firstName}
            detail={statusDetail(m)}
            badge={moveMeta(m)}
            status={m.status}
            extraCount={m.joined.length}
            trail={trailOf(m)}
            selected={m.id === selectedId}
          />
        </Marker>
      ))}
      {savedPins.map((mk) => (
        <Marker
          key={`saved-${mk.id}`}
          identifier={`saved-${mk.id}`}
          coordinate={{ latitude: mk.lat, longitude: mk.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={0}
          onPress={() => {
            selection();
            router.push(`/mark/${mk.id}`);
          }}
        >
          <SavedPin name={mk.name} color={categoryMeta(mk.category).color} />
        </Marker>
      ))}
      {me ? (
        <Marker coordinate={me} anchor={{ x: 0.5, y: 0.8 }} displayPriority="required" zIndex={5}>
          <AvatarPin image={bitmojiFor(myId, 'walk')} name="Me" detail="now" status="me" />
        </Marker>
      ) : null}
    </MapView>
  );
});

export default MovesMap;
