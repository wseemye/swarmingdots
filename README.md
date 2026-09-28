# Dot Matrix

Fifty everyday objects drawn as dot-matrix icons. Each one starts as a
public-domain vector, gets rasterised to a fixed 40-cell grid at build time, and
is rendered as a lattice of small rounded squares — one grid cell, one dot,
nothing else.

```sh
npm install
npm run dev        # gallery on http://localhost:5173
npm run vectorize  # regenerate src/icons.ts from src/assets/*.svg
npm run build
```

## Fixed constants

These never vary. They live in `src/DotMatrix.tsx`.

|                | desktop     | mobile      |
| -------------- | ----------- | ----------- |
| canvas maximum | 600 × 600px | 300 × 300px |
| dot size       | 6 × 6px     | 3 × 3px     |
| corner radius  | 2.4px       | 1.2px       |

Grid resolution is 40 cells wide, with the height following the source vector's
aspect ratio. Dots sit at exact integer positions `(x · dotSize, y · dotSize)`
and are exactly `dotSize` across, so the lattice is edge-to-edge with no gaps
and no overlaps. Background is `#fafaf7`, dots are `#111`.

Mobile is detected with `window.matchMedia('(max-width: 600px)')` unless the
`mobile` prop is passed explicitly.

## Layout

| file                   | role                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `src/assets/*.svg`     | the raw vectors, one per shape, each carrying its provenance in an XML comment               |
| `scripts/vectorize.ts` | build tool — reads every asset, regenerates `src/icons.ts`. Idempotent.                      |
| `src/icons.ts`         | generated registry, `{ word: () => ({ cells, cols, rows }) }`. Never edited by hand.          |
| `src/DotMatrix.tsx`    | the single renderer. Walks `cells`, draws one `<rect>` each.                                  |

Nothing is fetched or rasterised at runtime — `src/icons.ts` is a static array
of cell coordinates, and the grid is the only source of truth the renderer has.

## How vectorize works

1. The SVG's `width`/`height` are pinned to a 1200px-wide raster and handed to
   `sharp`, so librsvg draws it crisply at that size rather than scaling a small
   render up.
2. Every pixel is classified as ink or not. Artwork on a transparent canvas uses
   alpha; artwork drawn over an opaque background uses distance from the
   background colour, sampled from the corners.
3. The ink bounding box is trimmed, so padding baked into a source file cannot
   shrink the icon inside the grid, and the grid aspect comes from the object
   rather than the canvas.
4. Each of the 40 × N cells takes the mean ink coverage of the source pixels
   underneath it (via a summed-area table) and is filled when coverage reaches
   0.34. A strict majority drops one-pixel features — bicycle spokes, the legs of
   a chair — and the silhouette stops reading; 0.34 keeps them while still
   discarding antialiasing haloes.
5. Cells are written to `src/icons.ts` in row-major order.

A vector taller than 2.5:1 would overflow the 600px canvas at 40 cells wide, so
the script scales it to fit instead of keeping the column count. None of the
current fifty need it — `bottle` sits exactly at the 100-row limit.

## Adding a shape

1. Put a CC0 or public-domain SVG at `src/assets/<word>.svg`, with a comment
   recording the source URL, the licence URL, and the exact licence string.
2. `npm run vectorize`.
3. The gallery picks up the new key automatically.

If the result does not read as the named object at 40 cells wide, swap the
source vector rather than tuning the renderer.

## Provenance and licensing

Every asset is CC0 1.0 Universal or an equivalent public-domain dedication, with
its source recorded in a comment at the top of the file.

Thirty-five come from CC0 icon sets:

- [Pinhead Map Icons](https://github.com/waysidemapping/pinhead) by Quincy Morgan — CC0-1.0
- [Temaki](https://github.com/rapideditor/temaki) by Bryan Housel — CC0-1.0
- [Maki](https://github.com/mapbox/maki) by Mapbox — CC0-1.0

The other fifteen — backpack, broom, drum, guitar, headphones, magnet, mirror,
notebook, pencil, plate, refrigerator, rope, sword, toaster, umbrella — are
original artwork drawn for this repository and dedicated to the public domain
under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No CC0
silhouette of those objects existed in the public-domain vector libraries
reachable from the environment this was built in.
