# Interchange design notes

## The idea in one line
A satellite's printout you can talk to. The planet is drawn in type from real data, a scan line marks anything new, and a highlighter marks what's yours.

The transit idea from v1 stays where it explains something: datasets are stations on lines for each Earth sphere, a build is a route, the read-back sign flips like a departure board, the examples are a departures board, and a published link is printed as a ticket.

## Tokens
| Token | Value | Use |
| --- | --- | --- |
| fog | #E7EAEC | Behind maps and previews |
| paper | #ECEEF0 | Page |
| surface | #F7F8F8 | Panels, inputs, cards |
| ink | #121518 | Text, rules, the band, primary buttons |
| graphite | #5E656C | Secondary text |
| cobalt | #1D3FD6 | The signal: scan lines, the satellite, focus rings, Publish |
| highlighter | #E4EE4A | Fills only, never text: hover passes, the place you asked about, what changed, the probe |
| data inks | land cover: crop #B98B10, forest #2D6A3E, grass #7E8F3E, desert #A9814E, cities #D2462C, ice #6F9DBA; sea: cold #354E96 to warm #CE4A2C | The globe's glyphs only |

Type: IBM Plex Sans Condensed for headings, buttons and labels; IBM Plex Sans for reading; IBM Plex Mono only where a value is data (the globe's glyphs, the read-back sign, the probe, coordinates).

## Signature moments
1. **The globe.** A canvas of characters, one per half-degree cell of ESA CCI land cover and NOAA sea surface temperature, in orthographic projection. Glyph and ink both carry meaning (`=` cropland, `#` forest, `~` warm sea). It turns to the place in the question, marks it with highlighter, and the satellite named in the read-back sweeps its real swath width (Sentinel-2 290 km, MODIS 2,330 km). Hover reads out what's under the cursor; click asks about that spot.
2. **Tasking.** Pressing Build on the home page re-aims the orbit so the next pass goes over your place, then opens the studio.
3. **Departure board.** The read-back values flip letter by letter when they change.
4. **Downlink.** New pixels on a map arrive under a cobalt scan line that sweeps top to bottom.
5. **Highlighter.** Buttons and chips get a highlighter pass on hover; the primary button gets a scan line instead.
6. **Ticket.** Publish prints the route as a ticket; copying the link tears the stub.
7. **Development.** On arrival the globe's characters flicker through other glyphs and settle into the real planet, cell by cell; a click sends a cobalt ripple out from the spot.
8. **Probe.** On any map, a highlighter tag follows the cursor with the value under it ("0.62 NDVI", "Built area"), the way you'd mark up a printout.
9. **Journey line.** A published journey draws its stops on a transit line in the dataset's color; the stop you're reading is highlighted, the ones you've passed are filled.

All of it stops under reduced motion: the globe holds still, flips and sweeps are instant.

## Layout
- Home: hero (headline, question, sign | globe), three jobs (tab list | real example), how it works (four steps on one scan line), departures board, the network, the comparison with Earth Engine.
- Studio: conversation and build log on the left (follow-up box pinned at the bottom), the running app on the right. On phones the app sits above the log.
- Journey: captions on a transit line down the left, one sticky map on the right that changes as the reader reaches each stop. On phones the map sits on top.

## Review against the generic defaults
- Dark page with neon glow: avoided. The page is light fog; only the band and the boards are ink.
- Cream, serif and terracotta: avoided. Cool gray paper, a condensed engineering sans, cobalt and highlighter.
- Dotted glow globe: avoided. Every character is a measurement, and the key says which.
- SaaS cards: avoided. Rules and lists; the only boxed things are the ones that are objects (a ticket, a sign, a figure).
