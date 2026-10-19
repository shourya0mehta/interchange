import { writeArrayBuffer } from 'geotiff';
import type { Grid } from './geo';
import type { SeriesPoint } from './series';

/**
 * A single-band Float32 GeoTIFF in Web Mercator (EPSG:3857), NaN as nodata. Opens in QGIS,
 * ArcGIS, rasterio and GDAL as a georeferenced layer.
 */
export function layerGeoTiff(values: Float32Array, grid: Grid): ArrayBuffer {
  const [x0, , x1, y1] = grid.merc;
  const dx = (x1 - x0) / grid.width;
  const dy = (grid.merc[3] - grid.merc[1]) / grid.height;
  return writeArrayBuffer(values, {
    width: grid.width,
    height: grid.height,
    ModelPixelScale: [dx, dy, 0],
    ModelTiepoint: [0, 0, 0, x0, y1, 0],
    GTModelTypeGeoKey: 1,
    GTRasterTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: 3857,
    GDAL_NODATA: 'nan',
  } as never) as ArrayBuffer;
}

export function seriesCsv(points: SeriesPoint[], valueName: string, lonLat: [number, number]): string {
  const head = `# point: ${lonLat[1].toFixed(5)}, ${lonLat[0].toFixed(5)}\ndate,${valueName},scene\n`;
  return head + points.map((p) => `${p.date},${p.value.toFixed(4)},${p.source}`).join('\n') + '\n';
}

export function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
