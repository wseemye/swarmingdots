# Dot Swarm

Eighty everyday objects drawn as dot-swarm icons. Each one starts as a
public-domain vector, gets rasterised to a fixed 48-cell grid at build time, and
is rendered as a lattice of small rounded squares — one grid cell, one dot,
nothing else.

```sh
npm install
npm run dev        # picker on http://localhost:5173
npm run vectorize  # regenerate src/icons.ts from src/assets/*.svg
npm run glyphs     # regenerate src/morph/glyph-data.ts from Geist Pixel (for /morph)
npm test           # unit tests for /morph: glyphs, layout, shapes, spring, settings
npm run build
```

## Routes

The site lives at [dots.wseem.com](https://dots.wseem.com), all in light mode. The
same navbar floats at the top of every page: text, morph, flags, github, with one
highlight that glides to the current page (`src/Nav.tsx`, styles in `src/shell.css`).
The two editors share one panel layout and one footer (`src/EditorActions.tsx`):
Replay and Reset, Copy Prompt, then Copy .TSX and About (on /text) or Share link
(on /morph).

The text swarm is at [`/text`](https://dots.wseem.com/text): type anything and
watch its dots swarm into text. `/` goes there too, and the old
`swarmingdots.vercel.app` redirects every path to the same path on
`dots.wseem.com`.

[`/flags`](https://dots.wseem.com/flags) swarms the dots into country flags;
type a country's name in the field under the flag and pick it from the
suggestions. Flags sit on the same white page as everything else; a flag's near-white parts
are drawn a pale grey so they do not vanish into it, and every other dot is drawn a
little darker, by just enough to make up for the white showing between the dots, so
the flag reads at its true colours. It opens on "fun with flags" swarming in as dark dot text, lowercase and
spaced out, as a staircase (a word to a line, each starting one space after
the end of the word above), (the same
`<DotSwarmText>` as `/text`) until a country is picked. It is one page: the flag shown is not part of the address, and old
`/flags/<code>` links land on `/flags`. See [Flags](#flags).

[`/morph`](https://dots.wseem.com/morph) is Morphing Pixels, merged in from its own
repository: type anything in Geist Pixel and watch every pixel morph between
Square, Triangle, Circle, Grid and Line. The engine is `src/morph/` (the
`<PixelMorph>` component), the editor `src/morph-editor/`. The editor keeps its
settings in the address (`/morph?text=hello&face=circle`), so Share copies a link
that opens it as it is; 1–5 switch faces. `scripts/registry-morph.ts` builds the
copy-in component at `/r/pixel-morph.tsx`, `.json` and `.md`. The old
`morphing-pixels.vercel.app` redirects to `/morph`.

The text editor and the morph editor share class names (`.chip`, `.row`,
`.variant`, ...) with different styles, so each stylesheet is scoped to its own
page with a zero-specificity `:where(.text-swarm, .intro)` / `:where(.editor)`
prefix.

The icons page is not routed; its engine (`src/icons.ts`,
`src/swarm.ts`, `src/DotSwarm.tsx`, the assets and the vectorizer) is still here,
documented below, for when it comes back.

The sentence wraps inside the canvas and never scrolls sideways. A
word wider than the canvas (a long URL, a row of dashes) is cut between letters
into the fewest pieces that fit, and re-cut live as the window or the font size
changes; words that already fit keep their swarm.

## Use it in your project

The text swarm is one component, `<DotSwarmText>`, in one file that needs only React.

1. **Try it.** Run the editor (`npm run dev`, above) or open
   [dots.wseem.com/text](https://dots.wseem.com/text), set the text, typeface, size and colour.
2. **Using an AI assistant?** "Copy Prompt" copies a prompt with your settings. The assistant reads
   [`/r/dot-swarm-text.md`](https://dots.wseem.com/r/dot-swarm-text.md), which holds the instructions, the props
   and the code, and adds the component for you.
3. **Or do it by hand.** "Copy .TSX" in the top left copies the whole component; save it as
   `components/dot-swarm-text.tsx`. It is also served at
   `https://dots.wseem.com/r/dot-swarm-text.tsx`, and `npm run registry` rebuilds it from
   `src/text-swarm/` into `public/r/`.

Nothing else is added to your project, and your colours and fonts are not touched.

Then use it like this:

```tsx
<DotSwarmText text="hello world" fontSize={40} variant="grid" anchor="top-left" swarmBy="word" />
```

| prop            | default    | what it does                                                        |
| --------------- | ---------- | ------------------------------------------------------------------- |
| `text`          |            | the text; newlines start a new line                                 |
| `fontSize`      | `26`       | px; one dot is 0.038 of it                                          |
| `color`         | inherited  | dot and text colour                                                 |
| `variant`       | `'circle'` | Geist Pixel face: `circle`, `grid`, `line` or `square` (see below)  |
| `letterSpacing` | `0`        | extra space after each letter, in dots                              |
| `lineSpacing`   | `6`        | gap between lines, in dots                                          |
| `anchor`        | `'center'` | where each word fills in from; with `swarmBy`, which turn goes first |
| `pairing`       | `'scatter'`| how dots find their places: `scatter` (random) or `trace` (pen path) |
| `swarmBy`       | `'word'`   | what the swarm is built from: `letter` makes each letter its own small brick, side by side with no gaps; `word`, `line` (as settled on screen) and `paragraph` (a line you started with Enter) keep a brick per word. With `stagger`, it is also what takes a turn |
| `stagger`       | `false`    | start those turns one after another, nearest the anchor first, instead of all together |
| `staggerMs`    | `100`      | only with `stagger`: ms between one turn starting and the next (ignored when `stagger` is off) |
| `speed`         | `0.75`     | how fast it plays: 1 is about a second a word, 0.5 takes twice as long, 2 half as long |
| `align`         | `'start'`  | where the block sits in its width                                   |
| `as`            | `'p'`      | the element that holds the text                                     |
| `fontUrl`       | jsDelivr   | where to load the variant's font if the page has no `@font-face`    |

Change its `key` to play it again. If the font cannot load, the text shows
plainly instead of swarming.

### Variants

Each variant is one of the Geist Pixel faces. Its dots are read out of that
face and drawn the way it draws a pixel (one lattice step is 38 font units), so
the settled dots line up exactly with the text that replaces them:

| variant  | each dot                                               | settles into                 |
| -------- | ------------------------------------------------------ | ---------------------------- |
| `circle` | a round dot                                            | dotted letters               |
| `grid`   | a 30/38 square centred in its cell, so a slight gap    | letters of separate squares  |
| `line`   | a bar the full cell wide on the cell's lower half      | rows of joined bars          |
| `square` | the whole cell                                         | solid letters, no dots       |

Geist Pixel Triangle is left out: its pixels do not tile into readable letters.

### Pairing

How each dot in the brick is matched to a cell in the letters:

- `scatter` shuffles the cells (Fisher–Yates), so every dot heads somewhere
  random: the brick bursts into a cloud and reassembles, filling in as a wave
  from the anchor.
- `trace` writes each word like a pen, one letter at a time, left to right,
  each letter finished before the next. For every letter,
  `src/text-swarm/trace.ts` finds a short open path through its cells, a
  travelling-salesman tour: nearest neighbour from the cell closest to the
  anchor, then 2-opt, which reverses any stretch whose reversal shortens the
  path (undoing crossings). The brick hands out its dots column by column from
  the left, the k-th to the k-th cell on the path, and they leave in path
  order over 0.7s, so the brick empties from the left as the pen moves right
  and a stream runs from the brick to the pen tip. Planning is done while the
  brick sits, one word per task.

While they move, a word's dots are drawn with WebGL: one instanced draw call
per word on a single shared, hidden WebGL canvas (browsers allow only a few
contexts per page), copied into the word's own canvas, so the layout and the
real text are untouched. Round dots are antialiased in the shader, and with an
opaque colour the GPU's multisampling decides edge coverage, so touching dots
meet without seams, exactly as one Canvas 2D path draws them. Without WebGL 2,
or if its context is lost, the same dots are drawn with Canvas 2D.

Whatever the variant, the words are real text in the page from the first
render, under the dots while they move and on their own once they settle, so
they can be selected, copied, searched, clicked and read by screen readers and
crawlers.

The file is generated on every build by `scripts/registry.ts`, which joins the
modules in `src/text-swarm/` that the site itself renders (`DotSwarmText.tsx`
and what it imports) into one file and wraps it as
`public/r/dot-swarm-text.json`. `npm run registry` regenerates it on its own.

Any other path, including `/` and the old `/icons`, redirects to `/text` and
keeps its query string. `vercel.json` rewrites every path to `index.html` so
that redirect also works on a direct load or refresh.

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

## Flags

`/flags` draws a country's flag entirely in dots, all the same size, on a
dark stage. Nothing else is drawn: no image of the flag is laid over the dots.

**Accurate in dots.** A flag drawn wrong can offend, so the dots have to carry
every detail themselves: India's chakra keeps its 24 spokes, every US star its
five points. Each flag is about 60,000 dots, and each dot's colour is the flag
rendered at exactly the grid's size, one pixel per dot
(`public/flags/dots/<code>.png`). A dot wholly inside a field is that field's own
colour; a dot a fine line crosses takes its share of the line, as a pixel on a
screen does. That keeps thin lines (spokes, star points, script) at an even
weight whatever their angle, where giving each dot one flag colour breaks them
up.

**Effortless and uniform.** Every flag is shown at the same area (half the
largest at which every flag on offer fits, in width and height) with about the
same number of dots, so the dots are the same size from flag to flag whatever
its proportions. Switching flags, every dot flies to a random spot in the next
flag. Dots set off at random over 0.7 s and each glides for 1.4 s on
`cubic-bezier(0.4, 0, 0.2, 1)`: a gentle start and a long, soft landing, so the
swarm is always moving rather than all leaving and all landing together. The
dots are drawn in one instanced WebGL call.

**Every flag.** 246 flags: every country and territory in
[`svg-country-flags`](https://github.com/hjnilsson/country-flags) (Wikipedia's
flags, public domain, in their official proportions and colours) except the
Netherlands Antilles (dissolved 2010), Antarctica (no official flag), the EU,
and those where showing a flag at all takes a side because the government, the
sovereignty or the flag itself is disputed: Afghanistan, Taiwan, Kosovo,
Western Sahara, the Falkland Islands, South Georgia and the South Sandwich
Islands, and the British Indian Ocean Territory (`DISPUTED` in
`scripts/flags.ts`).
That package was last updated in 2021, so `scripts/flag-overrides/` holds the
flags adopted since (Kyrgyzstan 2023, Syria 2025, from
[`flag-icons`](https://github.com/lipis/flag-icons), MIT, re-centred on their
official proportions) and South Sudan, whose source draws its star in a way the
build's SVG renderer drops. Names are the ones people use now (Türkiye, Czechia,
Eswatini, North Macedonia), with other names searchable (Turkey, UK, Ivory
Coast, Burma). `npm run flags` builds every flag's dot image and
`src/flags/list.ts` in about 25 seconds.

Every built flag has been checked against Chromium's own rendering of its SVG at
the same size: no flag differs in more than 0.2% of its dots (anti-aliasing),
which is how the missing South Sudan star was caught.

The country's name is set in Geist Serif (`public/fonts`, SIL Open Font License). Of the grids near 60,000 dots with square cells,
it keeps the one that puts the most dots wholly in one of the flag's own
colours, so stripes land on whole rows: the US flag gets 345 × 182, fourteen
rows to a stripe, and India 301 × 201, 67 to a band.

When a flag changes, add its new SVG to `scripts/flag-overrides/` (and its code
to `OVERRIDES`), run `npm run flags`, and check it on `/flags`.
