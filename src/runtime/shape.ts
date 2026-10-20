import { lonLatToMerc, type Grid } from './geo';

type Ring = [number, number][];

/** Douglas-Peucker on lon/lat, so a field boundary fits in a share link. */
export function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * ring[i][0] - dx * ring[i][1] + bx * ay - by * ax) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

/** Keeps a boundary under about 400 points in total by raising the tolerance until it fits. */
export function compactShape(rings: Ring[]): Ring[] {
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1e-3;
  let tol = span / 2000;
  let out = rings;
  for (let k = 0; k < 12; k++) {
    out = rings.map((r) => simplify(r, tol)).filter((r) => r.length >= 4);
    if (out.reduce((n, r) => n + r.length, 0) <= 400) break;
    tol *= 2;
  }
  return out.slice(0, 20);
}

/**
 * Which grid pixels fall inside the boundary (even-odd over all rings, so holes stay holes).
 * Scanline fill in Mercator space: one pass per row.
 */
export function shapeMask(grid: Grid, rings: Ring[]): Uint8Array {
  const { width: W, height: H, merc } = grid;
  const mask = new Uint8Array(W * H);
  const sx = W / (merc[2] - merc[0]);
  const sy = H / (merc[3] - merc[1]);
  const px = rings.map((r) => r.map(([lon, lat]) => {
    const [x, y] = lonLatToMerc(lon, lat);
    return [(x - merc[0]) * sx, (merc[3] - y) * sy] as [number, number];
  }));
  const xs: number[] = [];
  for (let row = 0; row < H; row++) {
    const y = row + 0.5;
    xs.length = 0;
    for (const r of px) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (yi > y !== yj > y) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5));
      const b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let c = a; c <= b; c++) mask[row * W + c] = 1;
    }
  }
  return mask;
}
