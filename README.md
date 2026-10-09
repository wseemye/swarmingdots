# Dot Swarm

Eighty everyday objects drawn as dot-swarm icons. Each one starts as a
public-domain vector, gets rasterised to a fixed 48-cell grid at build time, and
is rendered as a lattice of small rounded squares — one grid cell, one dot,
nothing else.

```sh
npm install
npm run dev        # picker on http://localhost:5173
npm run vectorize  # regenerate src/icons.ts from src/assets/*.svg
npm run build
```

## Routes

For now the site is only the text swarm: type anything and watch its dots swarm
into text, at `/text`. The icons page is not routed; its engine (`src/icons.ts`,
`src/swarm.ts`, `src/DotSwarm.tsx`, the assets and the vectorizer) is still here,
documented below, for when it comes back.

On `/text` the sentence wraps inside the canvas and never scrolls sideways. A
word wider than the canvas (a long URL, a row of dashes) is cut between letters
into the fewest pieces that fit, and re-cut live as the window or the font size
changes; words that already fit keep their swarm. The exported HTML and the
copied prompt do the same.

`/` and any unknown path redirect to `/text`. `vercel.json` rewrites every path
to `index.html` so the routes also work on a direct load or refresh.

## Swarming

One display, eighty word buttons. Click a word, or tab to it with the
keyboard, and the dots on the left travel to that shape — click or tab to
another and they redirect from wherever they currently are.

The motion has two parts. Cell `j` of the target is where dot `j` would land
if paired by index, but the vectoriser emits cells row by row, so that pairing
sweeps across the field in one direction. Each swarm instead reshuffles the
target's cells with a Fisher–Yates pass, so dot `i` is sent to an arbitrary
cell of the shape it's heading for — the source shape dissolves into a loose
cloud and reassembles, rather than sliding into place. The path itself stays a
straight line, eased with a quintic ease-in-out over 900ms; nothing fades in or
out, dots only move.

Pairing dot `i` with dot `i` needs both shapes to carry the same number of
dots, and these run from 410 (skateboard) to 1956 (dice). Padding every shape up
to the heaviest one seems like the obvious fix, but it isn't: a
skateboard(410)-to-spoon(643) transition would then drag 1956 dots through a
~2400-cell field, over 80% full, and a random reassignment in that little
space has nowhere empty to scatter into — it reads as fog, not a scatter.
Instead, each **transition** sizes itself to `max(source dots, target dots)`,
padding only the lighter shape (spreading the surplus evenly across its own
cells, so it blooms out of the whole silhouette rather than one corner) and
collapsing back to the target's real count once it lands. A light pair now
moves through roughly 6% of the field instead of 80%; a genuinely heavy target
like bottle still gets the density it needs, but only when it's actually
involved.

Rendering is canvas rather than SVG — repositioning thousands of elements a
frame is not something the DOM should be asked to do. Every dot is the same
rounded square, so one sprite is pre-rendered at device resolution and
stamped, and scratch buffers are sized once to the heaviest icon so no
transition allocates. `prefers-reduced-motion: reduce` jumps straight to the
picked shape.

## Fixed constants

These never vary. They live in `src/DotSwarmStatic.tsx`.

|                | desktop     | mobile      |
| -------------- | ----------- | ----------- |
| canvas maximum | 600 × 600px | 300 × 300px |
| dot size       | 6 × 6px     | 3 × 3px     |
| corner radius  | 2.4px       | 1.2px       |

Grid resolution is 48 cells wide, with the height following the source vector's
aspect ratio. Dots sit at exact integer positions `(x · dotSize, y · dotSize)`
and are exactly `dotSize` across, so the lattice is edge-to-edge with no gaps
and no overlaps. Background is `#fafaf7`, dots are `#111`.

Mobile is detected with `window.matchMedia('(max-width: 600px)')` unless the
`mobile` prop is passed explicitly.

## Layout

| file                   | role                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `src/assets/*.svg`     | the raw vectors, one per shape, each carrying its provenance in an XML comment       |
| `scripts/vectorize.ts` | build tool — reads every asset, regenerates `src/icons.ts`. Idempotent.              |
| `src/icons.ts`         | generated registry, `{ word: () => ({ cells, cols, rows }) }`. Never edited by hand. |
| `src/DotSwarmStatic.tsx`| static renderer — walks `cells`, draws one `<rect>` each. Holds the constants.       |
| `src/swarm.ts`         | exposes each icon's own unpadded cells, plus the shared field size.                  |
| `src/DotSwarm.tsx`     | the animated display: one canvas, sized-per-transition scatter, one rAF loop.        |

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
4. Each of the 48 × N cells takes the mean ink coverage of the source pixels
   underneath it (via a summed-area table) and is filled when coverage reaches
   0.42. A strict majority drops one-pixel features — bicycle spokes, the legs of
   a chair — and the silhouette stops reading; 0.42 keeps them while still
   discarding antialiasing haloes.
5. Cells are written to `src/icons.ts` in row-major order.

A vector taller than about 1:1 would overflow the 50-row (300px) canvas at 48
cells wide, so the script scales it to fit instead of keeping the column count.
Tall objects such as `bottle` (20 × 50) and `lipstick` (14 × 50) therefore come
out narrower than the 48-cell maximum.

48 columns rather than fewer matters for the 15px source art: it lands at about
3.2 cells per source pixel, so symmetric details (the plus on the battery, the
keyhole on the lock) stay symmetric instead of coming out lopsided.

## Adding a shape

1. Put a CC0 or public-domain SVG at `src/assets/<word>.svg`, with a comment
   recording the source URL, the licence URL, and the exact licence string.
2. `npm run vectorize`.
3. The picker grows a button automatically.

If the result does not read as the named object at 48 cells wide, swap the
source vector rather than tuning the renderer.

## Provenance and licensing

Every asset is CC0 1.0 Universal or an equivalent public-domain dedication, with
its source recorded in a comment at the top of the file.

Sixty-five come from CC0 icon sets:

- [Pinhead Map Icons](https://github.com/waysidemapping/pinhead) by Quincy Morgan — CC0-1.0
- [Temaki](https://github.com/rapideditor/temaki) by Bryan Housel — CC0-1.0
- [Maki](https://github.com/mapbox/maki) by Mapbox — CC0-1.0

The other fifteen — backpack, broom, drum, guitar, headphones, magnet, mirror,
notebook, pencil, plate, refrigerator, rope, sword, toaster, umbrella — are
original artwork drawn for this repository and dedicated to the public domain
under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). No CC0
silhouette of those objects existed in the public-domain vector libraries
reachable from the environment this was built in.
