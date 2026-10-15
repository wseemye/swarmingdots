# Swarming Dots

A React text component whose words arrive as a swarm of dots. Each word starts
as a brick of its own dots, the dots fly into the letters of
[Geist Pixel](https://vercel.com/font), and real, selectable text takes their
place.

**Demo and editor:** [swarmingdots.vercel.app](https://swarmingdots.vercel.app)

## Use it

`<DotSwarmText>` is one file that needs only React 18 or later.

- **By hand:** click "Copy .TSX" in the editor, or download
  [`/r/dot-swarm-text.tsx`](https://swarmingdots.vercel.app/r/dot-swarm-text.tsx),
  and save it as `components/dot-swarm-text.tsx`.
- **With shadcn** (only if the project already has a `components.json`; otherwise
  shadcn's setup rewrites your theme and fonts):
  `npx shadcn@latest add https://swarmingdots.vercel.app/r/dot-swarm-text.json`
- **With an AI assistant:** click "Copy Prompt" in the editor and paste it. The
  assistant follows [`/r/dot-swarm-text.md`](https://swarmingdots.vercel.app/r/dot-swarm-text.md).

```tsx
<DotSwarmText text="hello world" fontSize={40} variant="grid" anchor="top-left" />
```

Change its `key` to replay it. If the font can't load, the text shows plainly.
The text is in the DOM from the first render, so it stays selectable and
readable by screen readers and crawlers.

| prop            | default     | description                                                                 |
| --------------- | ----------- | --------------------------------------------------------------------------- |
| `text`          |             | the text; newlines start a new line                                         |
| `fontSize`      | `26`        | px; one dot is 0.038 of it                                                  |
| `color`         | inherited   | dot and text colour; any CSS colour, including `var(--x)`                   |
| `variant`       | `'circle'`  | Geist Pixel face: `circle`, `grid`, `line` or `square`                      |
| `letterSpacing` | `0`         | extra space after each letter, in dots                                      |
| `lineSpacing`   | `6`         | gap between lines, in dots                                                  |
| `anchor`        | `'center'`  | where each word fills in from: `top-left`, `top`, …, `bottom-right`         |
| `pairing`       | `'scatter'` | `scatter` sends dots to random cells; `trace` writes letters along a pen path |
| `swarmBy`       | `'word'`    | `letter` gives each letter its own brick; `word`, `line`, `paragraph` use one per word. Also the unit `stagger` steps through |
| `stagger`       | `false`     | start each unit one after another, nearest the anchor first                 |
| `staggerMs`     | `100`       | ms between units when staggering (the whole run is capped at 3s)            |
| `speed`         | `0.75`      | playback rate; 1 is about a second per word                                 |
| `align`         | `'start'`   | `start`, `center` or `end` within the available width                       |
| `as`            | `'p'`       | element that holds the text                                                 |
| `className`     |             | class for the wrapper                                                       |
| `fontUrl`       | jsDelivr    | where to load the font if the page has no `@font-face` for it               |
| `onMissingGlyphs` |           | called with characters the font can't draw (they are left out)              |

## How it works

- **Dots from the font.** `rasterize.ts` draws each glyph to a canvas and reads
  off its lattice (one dot is 38 font units), so the settled dots line up
  exactly with the text that replaces them. Triangle is left out because its
  pixels don't tile into readable letters.
- **Wrapping.** Lines break where the settled words will. A word wider than the
  container is cut between letters into the fewest pieces that fit, and re-cut
  on resize.
- **Pairing.** `scatter` shuffles target cells (Fisher–Yates), so the brick
  bursts and reassembles as a wave from the anchor. `trace` builds a short path
  through each letter (nearest neighbour, then 2-opt) and feeds dots into it
  column by column, so the brick empties as the pen moves right.

## Develop

```sh
npm install
npm run dev       # editor at http://localhost:5173
npm run lint
npm run build     # also regenerates public/r/
npm run registry  # regenerate public/r/ only
```

| path                          | what it is                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `src/text-swarm/DotSwarmText.tsx` | the component, plus `anchors`, `variants`, `words`, `ease`, `rasterize`, `wave`, `trace`, `Word` it imports |
| `src/text-swarm/TextSwarm.tsx`    | the editor at `/`                                              |
| `src/text-swarm/Intro.tsx`        | the about page at `/intro`                                     |
| `scripts/registry.ts`             | joins the component's modules into `public/r/dot-swarm-text.{tsx,json,md}` |

The copy-in file is generated from the same modules the site renders, so what
people install is what the editor shows. Any other path redirects to `/`.

See [CONTRIBUTING.md](CONTRIBUTING.md) to send a change.

## License

Code: [MIT](LICENSE). Fonts in `public/fonts/`: Geist Pixel by Vercel, under the
[SIL Open Font License 1.1](public/fonts/OFL.txt).
