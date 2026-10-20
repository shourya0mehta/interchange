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

## The preview size follows how a dataset is tiled
One fixed 3,000 km² cap made an ocean question impossible and a state-wide MODIS map pointless. Each dataset now declares how much area its live preview reads: OISST is one global quarter-degree file per day, so a whole ocean costs one read; Sentinel-2 comes in 110 km tiles, so it stays at a county. The planner ranks routes by how much of the place each can show, unless the question asks for fields, farms or streets, where detail wins.

## MODIS flag layers are read on their native grid
The MODIS snow and fire COGs on Planetary Computer have averaged overviews: snow (200) and no snow (25) blur into values like 112, and a lone fire pixel (8) averages away. Counting looks reads full resolution, which is why those previews stop at 250,000 to 400,000 km². Class maps (CDL, CCI, IO) were checked to keep exact codes in their overviews.

## Places are read without capital letters
The first reader found places as runs of capitalized words, so "atlantic ocean" or "fresno county california" found nothing. It now removes words that describe what or when (a fixed vocabulary), keeps place nouns next to what's left ("Lake", "County"), and scores the runs. Oceans, seas and big informal regions come from a gazetteer, since a street geocoder answers them with a point; boxes stay west of the date line because the grid can't wrap.

## Photon while typing, Nominatim when planning
The read-back looks the place up as you type. Nominatim's usage policy rules out lookups as you type, so that goes to Photon (built for it), with a ranking that prefers counties, cities, lakes and parks over a cemetery or office that shares the name. Photon hides counties behind same-named parks unless asked with `layer=county`. Planning reuses what the read-back found, and only asks Nominatim when it found nothing.

## Light, printed transit design
Black signage band, cool paper, Overpass (drawn from Highway Gothic), one color per Earth sphere. See DESIGN.md.

## A lookup outage is said at once
When Nominatim and Photon both fail outright (an HTTP error or no answer, as opposed to "no such place"), planning stops and says the lookup isn't answering, with Pick it on the map and Try again. It used to wait a second and retry first, which left the page silent.

## Everyday phrasing rules
- "San Diego", "St Louis", "El Paso": name particles can lead a place; only "of", "the" and "and" are trimmed from the front.
- "Snowpack in 2023" means the winter that ended in 2023. A bare year on a winter question moves back one, unless both years are written ("2022-23").
- "Right now", "currently", "today": the last 45 days instead of a season.
- "In July" with no year: the latest July that has ended.
- "Shrinking", "retreating", "drying up", "hotter than": a before and after, six years apart when no years are given.
- Rain during a named storm is that month's total; other storm questions are a before and after.

## Built for three jobs (October 2026 research)
A look at who actually builds simple satellite map apps found the open gap: nothing free and no-login turns one sentence into an embeddable map that mixes imagery with long climate records and land cover, with the citations included. The three best fits are local newsrooms (embed, credit line, social image), teachers (no-account links, questions beside the map, CSV) and extension offices (county comparisons, slide images). Insurers and claims teams are a poor fit: they need building-level answers, contracts and audit trails.

## A studio instead of a three-step builder
Prompt-to-app tools all put the conversation on the left and the running app on the right, and go straight to something that works. The old Ask, Route, App steps made people choose a route before they had seen anything. Now the best route builds at once, the steps it took are shown as a log, the other routes are one-tap chips, and follow-up requests change only what they mention. The route editor is still there behind "See every step".

## The globe is drawn from real data
A plain ASCII Earth is now an off-the-shelf component, so this one only earns its place if the characters mean something. `scripts/build-globe-data.mjs` reads the 32 ESA CCI 2020 land cover tiles at a coarse overview and the latest NOAA OISST day, and writes a 128 KB half-degree grid. CCI calls the sea "water bodies" too, so any cell with an OISST reading is ocean.

## Credit lines in the provider's wording
Newsrooms are asked to credit Copernicus data as "Contains modified Copernicus Sentinel data [year]"; Landsat, MODIS, NOAA, USDA and the land cover products each have their own preferred wording. The embed, the methods note and the exported image all carry the right one.

## Photon names countries in their own language
Photon returns Bangladesh as "বাংলাদেশ", so an exact-name bonus went to a neighborhood called Bangladesh in Mombasa. Countries and states now also match on Photon's English country and state fields, and are named in English.
