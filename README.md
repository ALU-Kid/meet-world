# meet-world

An interactive orthographic globe (D3 + TopoJSON). Click any country to open
its info panel; click **Download Terraink** to export a print-ready map poster
of that country's capital in the currently-selected globe theme.

## Files

- `Globe.html` — the single-page app (HTML + CSS + vanilla JS)
- `country-facts.js` — capital, population, timezone by ISO 3166-1 numeric
- `poster.js` — map-to-poster pipeline (ported from Terraink)

## Running

This is a static site. Serve the directory with any local web server; `file://`
won't work because D3 fetches the world-atlas topojson and MapLibre fetches
vector tiles over HTTP.

```bash
python3 -m http.server 8000
# open http://localhost:8000/Globe.html
```

## Themes

Seven themes are available, all with 1:1 download parity:

| Globe theme  | Terraink theme (download)                  |
|--------------|--------------------------------------------|
| atlas        | warm_beige                                 |
| midnight     | midnight_blue                              |
| terracotta   | terracotta                                 |
| blueprint    | blueprint                                  |
| sage         | sage                                       |
| noir         | noir                                       |
| neon         | neon                                       |

## Attribution

The poster pipeline in `poster.js` is derived from **Terraink**
([github.com/yousifamanuel/terraink](https://github.com/yousifamanuel/terraink),
© 2026 Yousuf Amanuel), licensed under AGPL-3.0-only. Specifically ported:
MapLibre style builder, offscreen map capture, poster compositor (fades +
typography), PNG encoder with pHYs DPI chunk, and the theme palettes for
Warm Beige, Midnight Blue, Terracotta, Blueprint, Sage, Noir, and Neon.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
Vector tiles hosted by [OpenFreeMap](https://openfreemap.org/). Geocoding via
[Nominatim](https://nominatim.openstreetmap.org/). Rendering via
[MapLibre GL JS](https://maplibre.org/).

"Terraink" is a trademark of Yousuf Amanuel; this project uses the name only
to attribute the upstream source per AGPL §5.

## License

This project is licensed under **AGPL-3.0-only** (see [LICENSE](./LICENSE))
because it incorporates AGPL-3.0 code from Terraink. Any deployment that
serves this over a network must make the corresponding source available per
AGPL §13.
