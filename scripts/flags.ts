import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// Builds the flags page's data from svg-country-flags (Wikipedia's flags, public domain, in their
// official proportions). For each flag it writes
//
//   public/flags/svg/<code>.svg    the flag itself, shown once the dots settle
//   public/flags/data/<code>.json  the dot grid the swarm settles into
//
// and src/flags/list.ts, the flags the page offers.
//
// The dots are only the arrival: once they settle, the real SVG fades in over them, so what stays
// on screen is the flag exactly as drawn. The grid still has to read as the flag while the dots
// move, so it is chosen to fit each flag: of the sizes around 96 columns, the one whose cells best
// line up with the flag's own stripes and edges wins, and every dot takes one of the flag's own
// colours rather than a blend of two.

const CODES = ['us', 'in'];

const PKG = join(process.cwd(), 'node_modules', 'svg-country-flags');
const PUBLIC = join(process.cwd(), 'public', 'flags');
const LIST = join(process.cwd(), 'src', 'flags', 'list.ts');

// The raster the cells are measured on. ~20 px a cell at 96 columns.
const RASTER_WIDTH = 2000;
// Grid widths tried; the height follows from the flag's proportions.
const MIN_COLS = 80;
const MAX_COLS = 104;
const PREFERRED_COLS = 96;
// A colour is one of the flag's own once it covers this much of the raster; antialiased edges
// never do.
const PALETTE_SHARE = 0.002;
// A pixel this close (RGB distance) to a palette colour counts as that colour.
const SNAP_DISTANCE = 72;
// Under this share of each cell agreeing on one colour, on average, the build warns: the dot
// stage of that flag needs a look.
const WARN_PURITY = 0.9;

type Grid = { cols: number; rows: number; purity: number; palette: string[]; cells: string };

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function aspect(svg: string): number {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
  if (vb) return Number(vb[2]) / Number(vb[1]);
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/.exec(svg);
  if (w && h) return Number(h[1]) / Number(w[1]);
  throw new Error('no size');
}

async function grid(svg: string): Promise<Grid> {
  const width = RASTER_WIDTH;
  const height = Math.round(width * aspect(svg));
  const pinned = svg.replace(/<svg\b[^>]*>/, (tag) => `${tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/g, '').slice(0, -1)} width="${width}" height="${height}">`);
  const { data } = await sharp(Buffer.from(pinned)).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = width * height;

  // The flag's own colours: the exact values that cover a real share of it.
  const exact = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const k = (data[i * 3] << 16) | (data[i * 3 + 1] << 8) | data[i * 3 + 2];
    exact.set(k, (exact.get(k) ?? 0) + 1);
  }
  const palette = [...exact].filter(([, n]) => n / count >= PALETTE_SHARE).sort((a, b) => b[1] - a[1]).map(([k]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);

  // Every pixel gets a key: a palette colour it is close to, or else a coarse bucket of its own
  // (detail such as a seal's shading), whose cells are coloured by the bucket's average.
  const keys = new Int32Array(count);
  const bucketIds = new Map<number, number>();
  const bucketSums: number[][] = [];
  for (let i = 0; i < count; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    let best = -1;
    let bestD = SNAP_DISTANCE;
    for (let p = 0; p < palette.length; p++) {
      const d = Math.hypot(r - palette[p][0], g - palette[p][1], b - palette[p][2]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best < 0) {
      const bk = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let id = bucketIds.get(bk);
      if (id === undefined) {
        id = palette.length + bucketSums.length;
        bucketIds.set(bk, id);
        bucketSums.push([0, 0, 0, 0]);
      }
      const s = bucketSums[id - palette.length];
      s[0] += r;
      s[1] += g;
      s[2] += b;
      s[3]++;
      best = id;
    }
    keys[i] = best;
  }
  const colourOf = (key: number) => {
    if (key < palette.length) return hex(palette[key][0], palette[key][1], palette[key][2]);
    const [r, g, b, n] = bucketSums[key - palette.length];
    return hex(r / n, g / n, b / n);
  };

  const counts = new Uint32Array(palette.length + bucketSums.length);
  const measure = (cols: number, rows: number) => {
    const winners = new Int32Array(cols * rows);
    let agree = 0;
    for (let y = 0; y < rows; y++) {
      const y0 = Math.round((y * height) / rows), y1 = Math.round(((y + 1) * height) / rows);
      for (let x = 0; x < cols; x++) {
        const x0 = Math.round((x * width) / cols), x1 = Math.round(((x + 1) * width) / cols);
        const touched: number[] = [];
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const k = keys[py * width + px];
            if (counts[k]++ === 0) touched.push(k);
          }
        }
        let win = touched[0];
        for (const k of touched) if (counts[k] > counts[win]) win = k;
        agree += counts[win] / ((x1 - x0) * (y1 - y0));
        for (const k of touched) counts[k] = 0;
        winners[y * cols + x] = win;
      }
    }
    return { winners, purity: agree / (cols * rows) };
  };

  const ratio = height / width;
  let best: { cols: number; rows: number; purity: number; winners: Int32Array } | null = null;
  for (let cols = MIN_COLS; cols <= MAX_COLS; cols++) {
    const exactRows = cols * ratio;
    for (const rows of new Set([Math.floor(exactRows), Math.ceil(exactRows)])) {
      // Keep the cells within 3% of square.
      if (Math.abs(rows / exactRows - 1) > 0.03) continue;
      const m = measure(cols, rows);
      // Ties (within 0.1%) go to the size nearest the preferred width.
      const better = !best || m.purity > best.purity + 0.001 || (Math.abs(m.purity - best.purity) <= 0.001 && Math.abs(cols - PREFERRED_COLS) < Math.abs(best.cols - PREFERRED_COLS));
      if (better) best = { cols, rows, ...m };
    }
  }
  if (!best) throw new Error('no grid fits');

  // Cells are one character each, an index into the colours they use.
  const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const used = new Map<string, number>();
  let cells = '';
  for (const key of best.winners) {
    const c = colourOf(key);
    let i = used.get(c);
    if (i === undefined) {
      i = used.size;
      used.set(c, i);
    }
    if (i >= ALPHABET.length) throw new Error('too many colours');
    cells += ALPHABET[i];
  }
  return { cols: best.cols, rows: best.rows, purity: best.purity, palette: [...used.keys()], cells };
}

async function main() {
  const names: Record<string, string> = JSON.parse(readFileSync(join(PKG, 'countries.json'), 'utf8'));
  const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;
  mkdirSync(join(PUBLIC, 'svg'), { recursive: true });
  mkdirSync(join(PUBLIC, 'data'), { recursive: true });

  const list: { code: string; name: string; ratio: number }[] = [];
  for (const code of CODES) {
    const name = names[code.toUpperCase()];
    const svg = readFileSync(join(PKG, 'svg', `${code}.svg`), 'utf8');
    const header = `<!-- Flag of ${name}. From svg-country-flags@${version} (https://github.com/hjnilsson/country-flags), drawn after Wikipedia; public domain. -->\n`;
    writeFileSync(join(PUBLIC, 'svg', `${code}.svg`), header + svg);

    const g = await grid(svg);
    writeFileSync(join(PUBLIC, 'data', `${code}.json`), JSON.stringify({ cols: g.cols, rows: g.rows, palette: g.palette, cells: g.cells }));
    list.push({ code, name, ratio: Number(aspect(svg).toFixed(6)) });
    const flag = g.purity < WARN_PURITY ? '  <- check the dot stage' : '';
    process.stdout.write(`${code}  ${name.padEnd(24)} ${String(g.cols).padStart(3)}x${String(g.rows).padEnd(3)} ${g.palette.length} colours  ${(g.purity * 100).toFixed(1)}% pure${flag}\n`);
  }

  writeFileSync(
    LIST,
    `// Generated by \`npm run flags\` from svg-country-flags. Do not edit by hand.\n\nexport type FlagEntry = { code: string; name: string; /** height / width */ ratio: number };\n\nexport const flags: FlagEntry[] = ${JSON.stringify(list, null, 2)};\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
