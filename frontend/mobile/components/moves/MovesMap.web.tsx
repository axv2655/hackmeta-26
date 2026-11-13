import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { Asset } from 'expo-asset';
import Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { moveMeta } from '@/lib/live';
import { bitmojiFor } from '@/lib/mock/bitmoji';
import { here, useLocation } from '@/lib/location';
import type { Coordinate, MapMove } from '@/lib/mock/moves';
import { useSession } from '@/lib/session';

import type { MovesMapHandle, MovesMapProps } from './MovesMap';

/**
 * Web build of the Moves map. react-native-maps is iOS/Android only, so on web
 * this Leaflet map (same tiles as frontend/web) stands in, with the same props
 * and handle. Friends are pinned at their Move's Mark, never GPS; "Me" is local.
 */
export { HOME_CAMERA } from './MovesMap.camera';

const ZOOM_HOME = 15;
const ZOOM_FOCUS = 17;
// A pin's coordinate is at its feet; aim this many px above so the person is centered.
const PIN_LIFT = 40;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const uri = (ref: number) => Asset.fromModule(ref).uri;
const ll = (c: Coordinate): Leaflet.LatLngTuple => [c.latitude, c.longitude];

function detailOf(m: MapMove): string {
  if (m.status === 'omw') return 'on the way';
  if (m.status === 'ghost') return `${m.timeLabel} ago`;
  return m.mark.name;
}

type PinArgs = { img: string; name: string; detail: string; status: string; me?: boolean; selected?: boolean; color?: string };

function pinIcon({ img, name, detail, status, me, selected, color }: PinArgs): Leaflet.DivIcon {
  const cls = ['wm-pin', status, me ? 'me' : '', selected ? 'sel' : ''].join(' ');
  const badge = color ? `<span class="wm-badge" style="background:${status === 'ghost' ? '#8a8d91' : color}"></span>` : '';
  return Leaflet.divIcon({
    className: 'wm-wrap',
    iconSize: [0, 0],
    html: `<div class="${cls}"><div class="wm-body"><img src="${esc(img)}" alt="">${badge}</div><div class="wm-label"><b>${esc(name)}</b><span>${esc(detail)}</span></div></div>`,
  });
}

const CSS = `
.wm-wrap{background:none;border:0}
.wm-pin{position:absolute;width:max-content;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-80%);cursor:pointer;font-family:system-ui,-apple-system,sans-serif}
.wm-body{position:relative;width:66px;height:66px;transform-origin:bottom;transition:transform .2s}
.wm-body::before{content:'';position:absolute;bottom:1px;left:25%;width:50%;height:9px;border-radius:999px;background:rgba(0,0,0,.22)}
.wm-body img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:bottom}
.wm-badge{position:absolute;top:8px;right:8px;width:14px;height:14px;border-radius:50%;border:2px solid #fff}
.wm-label{margin-top:-2px;padding:3px 9px;border-radius:10px;background:#fff;box-shadow:0 4px 14px rgba(15,25,50,.18);display:flex;flex-direction:column;align-items:center;max-width:140px}
.wm-label b{font-size:13px;line-height:16px;color:#050505}
.wm-label span{font-size:11px;line-height:13px;font-weight:600;color:#65676b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.wm-pin.there .wm-label span,.wm-pin.me .wm-label span{color:#31a24c}
.wm-pin.ghost .wm-body img{filter:grayscale(1);opacity:.5}
.wm-pin.sel .wm-body{transform:scale(1.35)}
.wm-pin.sel .wm-label{background:#0866ff}.wm-pin.sel .wm-label b,.wm-pin.sel .wm-label span{color:#fff}
.wm-pin.me .wm-body{width:86px;height:86px}
.wm-pin.me .wm-body::before{bottom:-3px;left:13%;width:74%;height:18px;background:rgba(255,214,10,.85);border:2px solid #f7b928;box-shadow:0 0 12px rgba(255,200,0,.7)}
.wm-pin.me.sel .wm-body{transform:scale(1.12)}
.wm-pin.me .wm-label{border:1.5px solid #f7b928}
`;

function injectCss() {
  if (document.getElementById('wm-css')) return;
  const el = document.createElement('style');
  el.id = 'wm-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

export const MovesMap = forwardRef<MovesMapHandle, MovesMapProps>(function MovesMap(
  { moves, selectedId, onSelect, onClear, onMePress, onCenterChange },
  ref,
) {
  const host = useRef<HTMLDivElement | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const myId = useSession((st) => st.userId);
  const me = useLocation((st) => st.coords);
  const handlers = useRef({ onSelect, onClear, onMePress, onCenterChange });
  handlers.current = { onSelect, onClear, onMePress, onCenterChange };

  const focusOn = (c: Coordinate, zoom: number, lift: number) => {
    const m = map.current;
    if (!m) return;
    const target = lift ? m.unproject(m.project(ll(c), zoom).subtract([0, lift]), zoom) : ll(c);
    m.flyTo(target, zoom, { duration: 0.65 });
  };

  useImperativeHandle(ref, () => ({
    focus: (c, zoomedIn = true) => focusOn(c, zoomedIn ? ZOOM_FOCUS : ZOOM_HOME, zoomedIn ? PIN_LIFT : 0),
    recenter: () => focusOn(here(), ZOOM_HOME, 0),
  }));

  useEffect(() => {
    if (!host.current) return undefined;
    injectCss();
    const m = Leaflet.map(host.current, { zoomControl: false }).setView(ll(here()), ZOOM_HOME);
    Leaflet.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '&copy; Stadia Maps &copy; OpenMapTiles &copy; OpenStreetMap contributors',
    }).addTo(m);
    m.on('click', () => handlers.current.onClear());
    m.on('moveend', () => {
      const c = m.getCenter();
      handlers.current.onCenterChange?.({ latitude: c.lat, longitude: c.lng });
    });
    map.current = m;
    layer.current = Leaflet.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);

  // Redraw the pins whenever the Moves, the selection or my position change.
  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    const ordered = [...moves].sort((a, b) => Number(b.status === 'ghost') - Number(a.status === 'ghost'));
    ordered.forEach((mv) => {
      const sel = mv.id === selectedId;
      const icon = pinIcon({
        img: uri(bitmojiFor(mv.user.id, mv.pose)),
        name: mv.mine ? 'You' : mv.user.firstName,
        detail: detailOf(mv),
        status: mv.status,
        me: mv.mine,
        selected: sel,
        color: moveMeta(mv).color,
      });
      const z = sel ? 1000 : mv.status === 'ghost' ? -500 : 0;
      Leaflet.marker(ll(mv.mark.coordinate), { icon, zIndexOffset: z, bubblingMouseEvents: false })
        .on('click', () => handlers.current.onSelect(mv.id))
        .addTo(group);
    });
    if (me) {
      const icon = pinIcon({ img: uri(bitmojiFor(myId, 'walk')), name: 'Me', detail: 'now', status: 'me', me: true });
      Leaflet.marker(ll(me), { icon, zIndexOffset: 500, bubblingMouseEvents: false })
        .on('click', () => handlers.current.onMePress?.(me))
        .addTo(group);
    }
  }, [moves, selectedId, me, myId]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div ref={host} style={{ width: '100%', height: '100%' }} />
    </View>
  );
});

export default MovesMap;
