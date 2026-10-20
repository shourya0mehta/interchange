import { describe, expect, it } from 'vitest';
import { makeGrid } from '../src/runtime/geo';
import { compactShape, shapeMask, simplify } from '../src/runtime/shape';

describe('Uploaded boundaries', () => {
  it('masks a grid to the inside of a square field', () => {
    const grid = makeGrid([-94, 42, -93, 43], 100);
    const ring: [number, number][] = [[-93.75, 42.25], [-93.25, 42.25], [-93.25, 42.75], [-93.75, 42.75], [-93.75, 42.25]];
    const m = shapeMask(grid, [ring]);
    const inside = m.reduce((n, v) => n + v, 0) / m.length;
    expect(inside).toBeGreaterThan(0.2);
    expect(inside).toBeLessThan(0.3);
    // The corner is outside, the center inside.
    expect(m[0]).toBe(0);
    expect(m[Math.floor(grid.height / 2) * grid.width + Math.floor(grid.width / 2)]).toBe(1);
  });
  it('keeps holes as holes', () => {
    const grid = makeGrid([0, 0, 1, 1], 50);
    const outer: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const hole: [number, number][] = [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6], [0.4, 0.4]];
    const m = shapeMask(grid, [outer, hole]);
    expect(m[Math.floor(grid.height / 2) * grid.width + Math.floor(grid.width / 2)]).toBe(0);
  });
  it('simplifies a dense boundary to fit in a link', () => {
    const ring: [number, number][] = Array.from({ length: 3000 }, (_, i) => {
      const a = (i / 2999) * Math.PI * 2;
      return [Math.cos(a) + Math.sin(a * 40) * 1e-5, Math.sin(a)];
    });
    expect(simplify(ring, 0.001).length).toBeLessThan(200);
    expect(compactShape([ring]).reduce((n, r) => n + r.length, 0)).toBeLessThanOrEqual(400);
  });
});
