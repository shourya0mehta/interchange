# Interchange design notes

## The idea in one line
A transit system for Earth observation. Datasets are stations, Earth spheres are lines, a person's project is a route, and the app is where the route ends.

## Tokens
| Token | Value | Use |
| --- | --- | --- |
| paper | #F5F6F3 | Page. Cool enamel off-white, not cream |
| ink | #222629 | Text |
| signal black | #000000 | The signage band only (true black, as on subway signs) |
| rule | #D7DAD4 | Dividers, quiet strokes |
| mute | #6B7177 | Secondary text |
| line colors | atmosphere #D4A017, biosphere #2E8B3E, hydrosphere #1F64B5, cryosphere #2BA3B8, lithosphere #B4532A | Category only: which sphere a station serves, and the active route |

Type: Overpass (open source, drawn from Highway Gothic, the US road-sign face) for everything; Overpass Mono only for dataset IDs a person might copy. Scale 13 / 15 / 18 / 24 / 36, weights 400 / 600 / 800.

## Layout
```
┌────────────────────────────────────────────────────────────────────┐
│ ◉ Interchange   Network  Route  App   [ What do you want to see? ][Plan] │  black signage band
├────────────────────────────────────────────────────────────────────┤
│ Network: full-width transit map, dossier slides in from the right   │
│ Route:   candidate lines (left, ~440px) │ map of the place (right)  │
│ App:     live app, full bleed, with a thin builder rail             │
└────────────────────────────────────────────────────────────────────┘
```
Left-aligned text everywhere; the map carries the visual weight.

## Principles
1. The one loud thing is the signage band and the route line. Everything else is quiet paper and ink.
2. Color only means a sphere. No decorative accents, gradients or shadows.
3. Lists separated by rules, not cards. A route is drawn, not boxed.
4. One orchestrated motion: the route line draws itself when a plan arrives; a train dot runs it while data loads. Off under reduced motion.
5. Copy names things the way a researcher would: "Click for history", "Blend clear days", never "pipeline step".

## Review against the generic defaults
- Cream + serif + terracotta: avoided. Paper is cool gray-white, type is a sans from road signage, rust is one of five line colors and never an accent.
- Dark page with one acid accent: avoided. Only the band is black, as on real signage.
- SaaS cards: avoided. Routes are line diagrams on rules; the dossier is a sign, not a card.
- Mono for small labels: only for dataset IDs.
