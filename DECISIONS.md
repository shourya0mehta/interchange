# Decisions

Each call, why, and what backs it.

## Compute stays in the browser for v1
Reading COG windows at an overview matched to the screen keeps a county-sized layer to a few megabytes. Measured: Sentinel-2 NDVI for Tompkins County in about 3 seconds; Landsat 2010 in about 7. Multi-year composites over hundreds of scenes are not realistic here, so heavy routes export. This also flips Earth Engine's quota problem: a popular Interchange app costs its author nothing.

## Earth Search's Sentinel-2 offset is ignored
Earth Search publishes `offset: -0.1` on every Sentinel-2 L2A band. Its COG pixels are already harmonized: across processing baselines 02.13 to 05.11, forest red reads 300 to 800 and water 80 to 300, which only makes sense with no offset. Applying it drove red negative and NDVI to 1 across a whole county (caught in the spike). Planetary Computer's Landsat scale and offset are applied as published.

## Landsat Tier 2 scenes are excluded
A Tier 2 Landsat 5 scene over Ithaca in July 2010 flagged bright cloud as high-confidence snow, so the QA mask kept it and half the county read as bare. Tier 1 only, plus a saturation check (reflectance above 1.05 is dropped).

## Masks are read at full resolution
Bit-packed QA bands and class bands are scrambled by averaged overviews. Masks are tiny (Sentinel-2 SCL tiles average 4 KB), so they are always read at native resolution while reflectance bands use overviews.

## Reprocessed duplicates are dropped per tile
Earth Search holds both `_0_L2A` and `_1_L2A` items for some dates. Scenes are grouped by day and platform, then deduplicated by MGRS tile (or WRS path and row), keeping the clearest.

## A typed route, not generated code
The model, when used, only fills a schema whose enums are the network's own stations, themes and views. AutoGEEval found 72% of GPT-4o's Earth Engine failures were parameter errors (dataset IDs, band names); picking from a curated graph removes that class of bug. The type checker then rejects impossible routes before anything runs.

## The rule reader is the default; Claude is optional
Free, instant and testable. The gallery test runs on it. A key unlocks looser phrasing through one Claude Haiku call with structured output, sent straight from the browser with the person's own key.

## The app lives in the link
An `AppSpec` compresses to 500 to 700 characters. No database, no hosting cost, nothing to take down. Forking is decoding the link back into a route.

## MapLibre 6 worker is copied as an asset
MapLibre 6 looks for its worker next to its own module, which bundling moves. The worker file is self-contained, so it is imported with `?url` and passed to `setWorkerUrl`.

## Geocoding falls back to Photon
Nominatim intermittently answers busy requests without CORS headers. The lookup tries Nominatim, then Photon (also OpenStreetMap, CORS-enabled), then Nominatim again after a second, then a shorter query.

## Point history searches year by year
A single date-sorted search capped at a few hundred results stopped a 2018-to-2026 chart at 2021. One search per year, then an even thinning to 80 scenes, covers the whole range.

## Light, printed transit design
Black signage band, cool paper, Overpass (drawn from Highway Gothic), one color per Earth sphere. See DESIGN.md.
