import { Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type ImageSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre 6 looks for its worker next to its own module; bundling moves it, so point at Vite's copy.
setWorkerUrl(workerUrl);
import type { Bbox } from '../runtime/geo';

export const BASEMAP = 'https://tiles.openfreemap.org/styles/positron';

export function createMap(container: HTMLElement, bbox: Bbox, opts: { interactive?: boolean; cooperative?: boolean } = {}): MlMap {
  const map = new MlMap({
    container,
    style: BASEMAP,
    bounds: bbox as [number, number, number, number],
    fitBoundsOptions: { padding: 24 },
    attributionControl: opts.interactive === false ? false : { compact: true },
    interactive: opts.interactive ?? true,
    fadeDuration: 0,
    // Inside an article or a journey, the page keeps the scroll wheel; zoom takes a modifier key.
    cooperativeGestures: opts.cooperative ?? false,
  });
  if (opts.interactive ?? true) map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  // MapLibre opens the credits on load; on a phone-width map that covers a third of it. Start
  // folded there: the (i) button is one tap away.
  map.once('load', () => {
    if (container.clientWidth < 640) container.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  });
  return map;
}

/** The first label layer, so data layers sit under place names. */
export function firstSymbolLayer(map: MlMap): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
}

export function whenStyled(map: MlMap): Promise<void> {
  return new Promise((resolve) => {
    if (map.isStyleLoaded()) resolve();
    else map.once('load', () => resolve());
  });
}

export function setImageLayer(
  map: MlMap,
  id: string,
  url: string | null,
  corners: [[number, number], [number, number], [number, number], [number, number]],
  opacity = 0.92,
): void {
  const src = map.getSource(id) as ImageSource | undefined;
  if (!url) {
    if (map.getLayer(id)) map.removeLayer(id);
    if (src) map.removeSource(id);
    return;
  }
  if (src) {
    src.updateImage({ url, coordinates: corners });
  } else {
    map.addSource(id, { type: 'image', url, coordinates: corners });
    map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-resampling': 'nearest' } }, firstSymbolLayer(map));
  }
}

export function setAoi(map: MlMap, bbox: Bbox, color = '#000', shape?: [number, number][][]): void {
  const [w, s, e, n] = bbox;
  const data = {
    type: 'Feature' as const,
    properties: {},
    geometry: shape?.length
      ? { type: 'MultiPolygon' as const, coordinates: shape.map((r) => [r]) }
      : { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
  };
  const src = map.getSource('aoi') as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else {
    map.addSource('aoi', { type: 'geojson', data });
    map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [3, 2] } });
  }
}
