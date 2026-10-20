import { Marker, type Map as MlMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { Bbox } from '../runtime/geo';
import { createMap, setAoi, setImageLayer, whenStyled } from './maplib';

type Corners = [[number, number], [number, number], [number, number], [number, number]];

export interface MapViewProps {
  bbox: Bbox;
  corners: Corners | null;
  /** Main layer (the "after" side when swiping). */
  url: string | null;
  /** Present only in swipe mode: drawn on the left of the divider. */
  beforeUrl?: string | null;
  labels?: [string, string];
  marker: [number, number] | null;
  onClick?: (lonLat: [number, number]) => void;
  clickable?: boolean;
  /** Filled with a function that grabs the map's pixels (both sides when swiping). */
  captureRef?: React.MutableRefObject<(() => Promise<HTMLCanvasElement[]>) | null>;
  /** Filled with a function that grabs the basemap alone, and where the data layer sits on it. */
  captureBaseRef?: React.MutableRefObject<(() => Promise<{ canvas: HTMLCanvasElement; rect: { x: number; y: number; w: number; h: number } } | null>) | null>;
  /** The cursor over the map: where, and which side of the swipe it's on. */
  onHover?: (h: { lonLat: [number, number]; x: number; y: number; side: 'before' | 'after' } | null) => void;
  /** Drawn at the cursor, e.g. the value under it. */
  probe?: React.ReactNode;
  /** An uploaded boundary to outline instead of the box. */
  shape?: [number, number][][];
  /** Leave the scroll wheel to the page (embeds and journeys). */
  cooperative?: boolean;
  /** Pixels a card covers on the map's left edge; the area is framed to the right of it. */
  padLeft?: number;
}

function grab(m: MlMap): Promise<HTMLCanvasElement> {
  return new Promise((res) => {
    m.once('render', () => {
      const src = m.getCanvas();
      const c = document.createElement('canvas');
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')!.drawImage(src, 0, 0);
      res(c);
    });
    m.triggerRepaint();
  });
}

export function MapView({ bbox, corners, url, beforeUrl, labels, marker, onClick, clickable, captureRef, captureBaseRef, onHover, probe, shape, cooperative, padLeft }: MapViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const mapA = useRef<MlMap | null>(null);
  const mapB = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [pos, setPos] = useState(0.5);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);
  const [ready, setReady] = useState(false);
  const [tiles, setTiles] = useState<'idle' | 'loading' | 'error'>('idle');
  const swipe = beforeUrl !== undefined;
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const posRef = useRef(0.5);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  if (captureRef)
    captureRef.current = async () => {
      const out: HTMLCanvasElement[] = [];
      if (mapA.current) out.push(await grab(mapA.current));
      if (swipe && mapB.current) out.push(await grab(mapB.current));
      return out;
    };
  if (captureBaseRef)
    captureBaseRef.current = async () => {
      const a = mapA.current;
      if (!a || !corners) return null;
      const has = !!a.getLayer('layer');
      if (has) a.setLayoutProperty('layer', 'visibility', 'none');
      const canvas = await grab(a);
      if (has) a.setLayoutProperty('layer', 'visibility', 'visible');
      const dpr = canvas.width / (a.getContainer().clientWidth || 1);
      const tl = a.project(corners[0]);
      const br = a.project(corners[2]);
      return { canvas, rect: { x: tl.x * dpr, y: tl.y * dpr, w: (br.x - tl.x) * dpr, h: (br.y - tl.y) * dpr } };
    };
  // The moment new pixels land, a scan line sweeps down the map, like a downlink.
  const [downlink, setDownlink] = useState(0);
  const hadUrl = useRef<string | null>(null);
  useEffect(() => {
    if (url && url !== hadUrl.current) setDownlink((n) => n + 1);
    hadUrl.current = url;
  }, [url]);

  // Map A always exists. In swipe mode it shows the "before" layer on the left; map B
  // sits on top, clipped to the right of the divider, showing "after".
  useEffect(() => {
    const a = createMap(aRef.current!, bbox, { cooperative, padLeft });
    mapA.current = a;
    a.on('click', (e) => clickRef.current?.([e.lngLat.lng, e.lngLat.lat]));
    // Fine pointers only: on touch, a probe under the finger just gets in the way.
    const fine = typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
    if (fine) {
      // One update per frame, however fast the mouse moves.
      let frame = 0;
      let last: { lng: number; lat: number; x: number; y: number } | null = null;
      a.on('mousemove', (e) => {
        last = { lng: e.lngLat.lng, lat: e.lngLat.lat, x: e.point.x, y: e.point.y };
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!last) return;
          const w = a.getContainer().clientWidth || 1;
          setCursor({ x: last.x, y: last.y });
          hoverRef.current?.({ lonLat: [last.lng, last.lat], x: last.x, y: last.y, side: last.x / w < posRef.current ? 'before' : 'after' });
        });
      });
      a.on('mouseout', () => {
        last = null;
        cancelAnimationFrame(frame);
        frame = 0;
        setCursor(null);
        hoverRef.current?.(null);
      });
    }
    // Say so when tiles take a while, and when they fail, instead of a blank map.
    let slow: ReturnType<typeof setTimeout> | undefined;
    a.on('dataloading', () => {
      if (slow) return;
      slow = setTimeout(() => {
        slow = undefined;
        if (!a.areTilesLoaded()) setTiles((t) => (t === 'error' ? t : 'loading'));
      }, 400);
    });
    a.on('idle', () => {
      clearTimeout(slow);
      slow = undefined;
      setTiles((t) => (t === 'loading' ? 'idle' : t));
    });
    a.on('error', (ev) => {
      const e = ev as unknown as { sourceId?: string; tile?: unknown; error?: { status?: number } };
      if (e.sourceId || e.tile || e.error?.status) setTiles('error');
    });
    whenStyled(a).then(() => {
      setAoi(a, bbox, '#000', shape);
      setReady(true);
    });
    return () => {
      clearTimeout(slow);
      // Tearing down a WebGL map is slow. When the whole view is leaving, let the next screen
      // paint first; when only the area changed, the container is reused, so remove it now.
      if (a.getContainer().isConnected) a.remove();
      else setTimeout(() => a.remove(), 0);
      mapA.current = null;
      setReady(false);
      setTiles('idle');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox.join(',')]);

  useEffect(() => {
    if (!swipe || !mapA.current) return;
    const a = mapA.current;
    const b = createMap(bRef.current!, bbox, { interactive: false });
    mapB.current = b;
    const sync = () => b.jumpTo({ center: a.getCenter(), zoom: a.getZoom(), bearing: a.getBearing(), pitch: a.getPitch() });
    a.on('move', sync);
    whenStyled(b).then(() => {
      sync();
      setAoi(b, bbox, '#000', shape);
      setReady((r) => r);
    });
    return () => {
      a.off('move', sync);
      if (b.getContainer().isConnected) b.remove();
      else setTimeout(() => b.remove(), 0);
      mapB.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipe, bbox.join(','), ready]);

  useEffect(() => {
    const a = mapA.current;
    if (!a || !ready || !corners) return;
    if (swipe) {
      setImageLayer(a, 'layer', beforeUrl ?? null, corners);
      const b = mapB.current;
      if (b) whenStyled(b).then(() => setImageLayer(b, 'layer', url, corners));
    } else {
      setImageLayer(a, 'layer', url, corners);
    }
  }, [url, beforeUrl, corners, ready, swipe]);

  useEffect(() => {
    const a = mapA.current;
    if (!a || !ready) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (marker) {
      const el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid #000;box-sizing:border-box';
      markerRef.current = new Marker({ element: el }).setLngLat(marker).addTo(a);
    }
  }, [marker, ready]);

  useEffect(() => {
    const el = aRef.current?.querySelector('canvas');
    if (el) el.style.cursor = clickable ? 'crosshair' : '';
  }, [clickable, ready]);

  const retryTiles = () => {
    const a = mapA.current;
    if (!a) return;
    setTiles('loading');
    for (const id of Object.keys(a.getStyle().sources)) {
      const src = a.getSource(id);
      if (src && src.type !== 'image') a.refreshTiles(id);
    }
  };

  // Keep the last message while the notice fades out.
  const noticeText = useRef('');
  if (tiles === 'loading') noticeText.current = 'Loading map tiles';
  if (tiles === 'error') noticeText.current = "Basemap tiles didn't load.";

  const startDrag = (e: React.PointerEvent) => {
    const wrap = wrapRef.current!;
    (e.target as Element).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      setPos(Math.min(0.98, Math.max(0.02, (ev.clientX - r.left) / r.width)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <div className="map" ref={aRef} data-testid="map" />
      {probe && cursor && (
        <div className="probe" style={{ transform: `translate(${cursor.x + 14}px, ${cursor.y + 14}px)` }} aria-hidden="true">
          {probe}
        </div>
      )}
      {downlink > 0 && (
        <div className="downlink" key={downlink} aria-hidden="true" onAnimationEnd={(e) => e.animationName === "downlink" && setDownlink(0)}>
          <div className="downlink-mask" />
        </div>
      )}
      <div className="map-notice" data-show={tiles !== 'idle'} role={tiles === 'error' ? 'alert' : 'status'} aria-hidden={tiles === 'idle'}>
        <span>{noticeText.current}</span>
        {tiles === 'error' && (
          <button className="btn-link" onClick={retryTiles}>
            Retry
          </button>
        )}
      </div>
      {swipe && (
        <>
          <div className="map map-top" ref={bRef} style={{ clipPath: `inset(0 0 0 ${pos * 100}%)` }} aria-hidden="true" />
          <div
            className="swipe-handle"
            style={{ left: `${pos * 100}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Swipe between dates"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos * 100)}
            aria-valuetext={`${Math.round(pos * 100)}% ${labels?.[0] ?? 'before'}`}
            onPointerDown={startDrag}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setPos((p) => Math.max(0.02, p - 0.05));
              if (e.key === 'ArrowRight') setPos((p) => Math.min(0.98, p + 0.05));
            }}
          >
            <span className="swipe-grip">◀ ▶</span>
          </div>
          {labels && (
            <div className="swipe-tags">
              <span className="tag">{labels[0]}</span>
              <span className="tag">{labels[1]}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
