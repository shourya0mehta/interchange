# Interchange

**Type a question about the planet, get a live map app that answers it, and see which satellites and methods it rode to get there.**

Try it: **[shourya0mehta.github.io/interchange](https://shourya0mehta.github.io/interchange/)**. Type a question on the landing page (or open one of the Departures), press Build this map, then Publish link.

Interchange is a prompt-to-app builder for Earth observation. You write one sentence ("compare greenness in Fresno County, California in summer 2019 vs summer 2025"). Interchange draws your project as a route across a transit map of the observing system: a data station, method stops, and an app at the end of the line. Every stop can be inspected and swapped. When the route looks right, it compiles into a map app with a share link that opens for anyone, no login.

Everything runs in the browser on open data. There is no server, no account and no compute bill.

| The network | A route for one sentence |
| --- | --- |
| ![Transit map of the observing system](docs/network.jpg) | ![Candidate routes with trade-offs](docs/route.jpg) |
| **Swipe app: Fresno County greenness, summer 2019 vs 2025** | **Click-for-history app: Tompkins County fields since 2018** |
| ![Before and after swipe](docs/app-swipe.jpg) | ![Map with a history chart](docs/app-history.jpg) |

## How it works

```
sentence ─▶ intent ─▶ candidate routes ─▶ type check ─▶ app spec ─▶ live app / share link
             │            │                                │
   rule reader or      network.ts: 24 stations,       runtime: reads COG windows
   Claude (your key)   9 methods, 7 components        straight from open buckets
```

1. **Read the goal, and say what was heard.** A rule-based reader pulls out the theme (greenness, floods, fire, snow, heat, rain, crops, ocean temperature...), the place, the dates and the app shape (swipe, time slider, click-for-history, region stats). It doesn't depend on capital letters: a vocabulary of non-place words, a gazetteer of oceans, seas and big regions, coordinates in several notations, named disasters ("hurricane harvey" brings its month and city) and common misspellings. A black sign under the question reads it all back as you type, and looks the place up. With an Anthropic API key, Claude Haiku reads the goal instead, constrained by a JSON schema to the network's own vocabulary.
2. **Plan routes.** Each theme has candidate stations in order of fit. The planner fits the dates to each station's record (Sentinel-2 can't see 2010, so the route transfers to Landsat), picks methods, and lays out the trade-offs: detail, revisit, years, clouds, and whether it runs live.
3. **Type-check.** A route is a typed program. `scene` flows into `index` and comes out `raster`; a click-for-history chart only accepts a `raster` from a station that changes over time; a swipe needs exactly two windows. Bad routes never reach the app.
4. **Compile.** The route becomes an `AppSpec` small enough to live in the URL (`#app=...`, 500 to 700 characters compressed). Publishing is copying a link.
5. **Run.** The runtime searches STAC catalogs (Earth Search, Planetary Computer), reads only the COG windows it needs at an overview level matched to the screen, masks clouds with each scene's own classification, blends up to three clear days, computes the index, reprojects into a Web Mercator grid and draws it under MapLibre's labels.

## What it can answer today

Fifteen datasets run live in the browser:

| Station | Reads | Signals | Live preview covers |
| --- | --- | --- | --- |
| Sentinel-2 L2A | Earth Search | true color, NDVI, NDWI, MNDWI, NBR, NDSI, NDMI, NDBI | 3,000 km² |
| Landsat 5, 8, 9 Collection 2 L2 (Tier 1) | Planetary Computer | same as Sentinel-2, back to 1984 | 6,000 km² |
| Sentinel-1 RTC | Planetary Computer | radar backscatter (floods through clouds) | 3,000 km² |
| MODIS 16-day NDVI | Planetary Computer | greenness since 2000 | 400,000 km² |
| MODIS land surface temperature (MOD11A2) | Planetary Computer | daytime ground temperature since 2000 | 1,000,000 km² |
| MODIS snow cover (MOD10A2) | Planetary Computer | share of weeks with snow on the ground | 250,000 km² |
| MODIS active fire (MOD14A2) | Planetary Computer | share of 8-day periods with a fire | 400,000 km² |
| NOAA OISST v2.1 | Planetary Computer | daily sea surface temperature and its anomaly, 1981 to now | a whole ocean |
| NOAA NClimGrid (US) | Planetary Computer | monthly rain and air temperature, 1895 to 2022 | the lower 48 |
| USDA Cropland Data Layer (US) | Planetary Computer | crop type by 30 m field, 2008 to 2021 | 15,000 km² |
| ESA CCI land cover | Planetary Computer | 22 classes, 1992 to 2020 | 4,000,000 km² |
| Impact Observatory annual land cover | Planetary Computer | 9 classes, 2017 to 2023 | 20,000 km² |
| ESA WorldCover | Planetary Computer | 11 classes, 2020 and 2021 | 20,000 km² |
| JRC Global Surface Water | Planetary Computer | water occurrence 1984 to 2021 | 40,000 km² |
| Copernicus DEM GLO-30 | Planetary Computer | elevation | 20,000 km² |

Each dataset previews as much of a place as it can read quickly, which depends on how it is tiled: a global quarter-degree SST file covers an ocean in one read, Sentinel-2's 110 km tiles don't. Routes are ranked by how well each dataset covers both the dates and the place.

Thirteen more stations (ERA5, CHIRPS, SMAP, GRACE, Sentinel-5P, GOES, Dynamic World, AlphaEarth, GEDI, Hansen forest change, night lights, SNOTEL, Argo) sit on the network map with dossiers. Routes through them end in an Earth Engine export instead of a live app.

## Tested
- **Prompt bank** (`test/prompts.test.ts`, `test/prompt-variants.test.ts`): 144 sentences across every theme and dataset, written the way people type them (lowercase, misspelled, coordinates, nicknames like NYC and LA, oceans, "1999-now", "summer '19"), and the same questions reworded several ways. Each is checked for place, theme, dates, the leading route, the type check and the compiled app.
- **Live prompts** (`scripts/prompts-live.mjs`): 36 questions typed into the real site, planned, built and checked for a drawn map (and a history chart where asked), two rounds each, against the real geocoders and catalogs.
- **Datasets** (`INTEGRATION=1 npm test`): real pixels from every new dataset, with plausible values (Phoenix summer ground near 50 °C, Gulf summer sea near 30 °C).

## Measured

- Tompkins County NDVI from Sentinel-2: about 3 seconds for a 768-pixel grid, from STAC search to pixels (Node, same code path as the browser).
- Click-for-history at a farm field, one year of Sentinel-2: 57 scenes searched, 36 clear looks, under 6 seconds.
- Gallery test: 10 of 10 sampled public Earth Engine apps rebuilt from one sentence with no hand edits (`test/gallery.test.ts`).
- Browser smoke test: 21 checks across the landing page, the Ask, Route and App steps, publishing, a history chart, land cover stats, sea surface temperature, the place picker and phone layouts, zero console errors (`scripts/smoke.mjs`).

## What is not built

- Multi-year composites over large areas in the browser. Heavy routes export to Earth Engine instead; a scheduled GitHub Action build is the planned v2 answer.
- Live previews are capped per dataset (see the table). Bigger places preview their center.
- The copies read here have gaps: OISST skips mid-2024 through 2025, NClimGrid ends in September 2022, the Cropland Data Layer in 2021.
- No accounts, uploads beyond the place name, private data, alerts or classification from examples (AlphaEarth embeddings are v3).
- The rule reader handles plain sentences; looser ones need a Claude key.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # unit tests, planner, gallery test
INTEGRATION=1 npm test # also reads real data from Earth Search and Planetary Computer
npm run build && npx vite preview --port 4173 &
npm run smoke          # headless browser walkthrough with screenshots in shots/
node scripts/prompts-live.mjs   # 46 real questions, built and checked twice each
```

## Data and credits

Imagery and products from ESA Copernicus, USGS/NASA Landsat, NASA MODIS, NOAA (OISST, NClimGrid), USDA NASS (Cropland Data Layer), ESA CCI, Impact Observatory/Esri, ESA WorldCover, the EC JRC and the Copernicus DEM, read through [Earth Search](https://registry.opendata.aws/sentinel-2-l2a-cogs/) by Element 84 and the [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/). Basemap by [OpenFreeMap](https://openfreemap.org/) with OpenStreetMap data; place lookups by Komoot Photon while typing and OpenStreetMap Nominatim when planning. The observing-system framing comes from Ryan Orbuch's [Natural General Intelligence](https://naturalgeneralintelligence.ai/#observing-system).

MIT license.
