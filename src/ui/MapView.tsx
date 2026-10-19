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
}

export function MapView({ bbox, corners, url, beforeUrl, labels, marker, onClick, clickable }: MapViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);
  const mapA = useRef<MlMap | null>(null);
  const mapB = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [pos, setPos] = useState(0.5);
  const [ready, setReady] = useState(false);
  const [tiles, setTiles] = useState<'idle' | 'loading' | 'error'>('idle');
  const swipe = beforeUrl !== undefined;
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  // Map A always exists. In swipe mode it shows the "before" layer on the left; map B
  // sits on top, clipped to the right of the divider, showing "after".
  useEffect(() => {
    const a = createMap(aRef.current!, bbox);
    mapA.current = a;
    a.on('click', (e) => clickRef.current?.([e.lngLat.lng, e.lngLat.lat]));
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
      setAoi(a, bbox);
      setReady(true);
    });
    return () => {
      clearTimeout(slow);
      a.remove();
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
      setAoi(b, bbox);
      setReady((r) => r);
    });
    return () => {
      a.off('move', sync);
      b.remove();
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
