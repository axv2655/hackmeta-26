import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { bitmojiFor } from '@/lib/mock/bitmoji';
import { me, myPosition, type Coordinate, type MapMove } from '@/lib/mock/moves';

import { AvatarPin } from './AvatarPin';

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
};

const HOME_CAMERA = {
  center: { latitude: 32.9846, longitude: -96.7462 },
  pitch: 35,
  heading: 0,
  altitude: 5200,
  zoom: 14.1,
};

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
  { moves, selectedId, onSelect, onClear, bottomPadding, topPadding },
  ref,
) {
  const mapRef = useRef<MapView>(null);

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
      mapRef.current?.animateCamera(HOME_CAMERA, { duration: 650 });
    },
  }));

  // Ghosts first so live pins draw on top of them.
  const ordered = [...moves].sort((a, b) => Number(b.status === 'ghost') - Number(a.status === 'ghost'));

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      initialCamera={HOME_CAMERA}
      showsPointsOfInterests={false}
      showsBuildings
      pitchEnabled
      showsCompass={false}
      showsUserLocation={false}
      toolbarEnabled={false}
      mapPadding={{ top: topPadding, bottom: bottomPadding, left: 0, right: 0 }}
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
            name={m.user.firstName}
            detail={statusDetail(m)}
            category={m.mark.category}
            status={m.status}
            extraCount={m.joined.length}
            selected={m.id === selectedId}
          />
        </Marker>
      ))}
      <Marker coordinate={myPosition} anchor={{ x: 0.5, y: 0.8 }} displayPriority="required" zIndex={5}>
        <AvatarPin image={bitmojiFor(me.id, 'walk')} name="Me" detail="now" status="me" />
      </Marker>
    </MapView>
  );
});

export default MovesMap;
