import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useRouter } from 'expo-router';

import { categoryMeta } from '@/lib/categories';
import { selection } from '@/lib/haptics';
import { moveMeta } from '@/lib/live';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import { here, useLocation } from '@/lib/location';
import type { Coordinate, MapMove } from '@/lib/mock/moves';
import { useSaved } from '@/lib/saved';
import { useSession } from '@/lib/session';

import { AvatarPin, SavedPin } from './AvatarPin';
import { HOME_CAMERA } from './MovesMap.camera';

export type MovesMapHandle = {
  /** Fly to a pin and center it in the open map. `bottom` is the sheet height it should clear once settled. */
  focus: (coordinate: Coordinate, zoomedIn?: boolean, bottom?: number) => void;
  recenter: () => void;
};

export type MovesMapProps = {
  moves: MapMove[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
  /** Tapped the "Me" pin, with where it stands. */
  onMePress?: (coordinate: Coordinate) => void;
  /** Bottom space covered by the sheet, so centering and the legal label clear it. */
  bottomPadding: number;
  topPadding: number;
  /** The map's center once a pan or zoom settles (for the city name). */
  onCenterChange?: (center: Coordinate) => void;
};

export { HOME_CAMERA };

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

const FOCUS = { pitch: 50, heading: 0, altitude: 1100, zoom: 16.2 };
// The pin's coordinate is at 80% of its height (its feet); its middle sits about this far above.
const PIN_MIDDLE = 30;
// Close enough: no correction under this many points.
const SLOP = 8;

/**
 * Full-screen Apple map with Bitmoji pins. Friends are pinned at the Mark of
 * their Move (never GPS); the current user's "Me now" pin is local only.
 */
export const MovesMap = forwardRef<MovesMapHandle, MovesMapProps>(function MovesMap(
  { moves, selectedId, onSelect, onClear, onMePress, bottomPadding, topPadding, onCenterChange },
  ref,
) {
  const mapRef = useRef<MapView>(null);
  const size = useRef({ width: 0, height: 0 });
  // Learned from the last correction: where the camera centers relative to a focused pin.
  const offset = useRef({ latitude: 0.0016, longitude: 0 });
  // Bumped by every new focus and every drag, so a stale correction never fires.
  const focusToken = useRef(0);
  const insets = useRef({ top: topPadding, bottom: bottomPadding });
  insets.current = { top: topPadding, bottom: bottomPadding };

  // Apple Maps centers the camera on the whole view; the sheet and header cover
  // part of it. Once the fly-in lands, measure where the pin really is and
  // nudge the camera so its middle sits in the middle of the open map.
  const settle = async (pin: Coordinate, bottom: number, token: number) => {
    const map = mapRef.current;
    const { width, height } = size.current;
    if (!map || !width || token !== focusToken.current) return;
    const at = await map.pointForCoordinate(pin);
    const want = { x: width / 2, y: (insets.current.top + height - bottom) / 2 + PIN_MIDDLE };
    const dx = at.x - want.x;
    const dy = at.y - want.y;
    if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
    const center = await map.coordinateForPoint({ x: width / 2 + dx, y: height / 2 + dy });
    if (token !== focusToken.current) return;
    offset.current = { latitude: pin.latitude - center.latitude, longitude: pin.longitude - center.longitude };
    map.animateCamera({ center }, { duration: 250 });
  };
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
    focus: (coordinate, zoomedIn = true, bottom) => {
      const token = ++focusToken.current;
      if (!zoomedIn) {
        mapRef.current?.animateCamera({ center: coordinate, pitch: 50, altitude: HOME_CAMERA.altitude, zoom: HOME_CAMERA.zoom }, { duration: 650 });
        return;
      }
      // First guess from the last correction, so later focuses land without a nudge.
      const center = { latitude: coordinate.latitude - offset.current.latitude, longitude: coordinate.longitude - offset.current.longitude };
      mapRef.current?.animateCamera({ center, ...FOCUS }, { duration: 650 });
      setTimeout(() => void settle(coordinate, bottom ?? insets.current.bottom, token).catch(() => undefined), 720);
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
      onLayout={(e) => {
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
      }}
      onPanDrag={() => {
        focusToken.current += 1;
      }}
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
            name={m.mine ? 'Me' : m.user.firstName}
            detail={statusDetail(m)}
            badge={moveMeta(m)}
            status={m.status}
            extraCount={m.joined.length}
            trail={trailOf(m)}
            selected={m.id === selectedId}
            me={m.mine}
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
        <Marker
          coordinate={me}
          anchor={{ x: 0.5, y: 0.8 }}
          displayPriority="required"
          zIndex={5}
          onPress={() => onMePress?.(me)}
        >
          <AvatarPin image={bitmojiFor(myId, 'walk')} name="Me" detail="now" status="me" />
        </Marker>
      ) : null}
    </MapView>
  );
});

export default MovesMap;
