import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// Builds the flags page's data from svg-country-flags (Wikipedia's flags, public domain, in their
// official proportions). For each flag it writes
//
//   public/flags/svg/<code>.svg       the flag itself, shown once the dots settle
//   public/flags/data/<code>.json     the dot grid the swarm settles into
//   public/flags/detail/<code>.png    the flag's detail, drawn exactly over the dots
//
// and src/flags/list.ts, the flags the page offers.
//
// A flag is never drawn wrong, not even in passing. Dots can draw a flat field of colour exactly,
// but not a chakra's spokes, a star's points, a seal or a line of script. So every shape of the
// flag is tested: drawn as whole dots, does it keep its form? Stripes, bands, crosses and a large
// disc do; anything that would come out distorted is detail. Detail never becomes dots. The dots
// under it take the colour of the field it sits on, and the detail itself is cut straight out of
// the rendered flag and laid over them as the dots land.

const CODES = ['us', 'in'];

const PKG = join(process.cwd(), 'node_modules', 'svg-country-flags');
const PUBLIC = join(process.cwd(), 'public', 'flags');
const LIST = join(process.cwd(), 'src', 'flags', 'list.ts');

// The raster everything is measured on, and the detail image's size.
const RASTER_WIDTH = 2000;
// Every flag gets about this many dots, so the page can show every flag at the same area with
// the same dot size.
const TARGET_DOTS = 5600;
// Grids tried: dot counts within this share of the target, cells within 3% of square.
const DOT_SPREAD = 0.1;
const SQUARE = 0.03;
// A colour is one of the flag's own once it covers this much of it; antialiased edges never do.
const PALETTE_SHARE = 0.002;
// A pixel within this RGB distance of a blend of two of the flag's colours is an antialiased
// edge between them, and counts as the nearer one.
const BLEND_DISTANCE = 24;
// A shape is drawn in dots only if, snapped to whole cells, it overlaps itself this well
// (intersection over union). Stripes score ~1; stars, spokes and lettering score far lower.
const KEEPS_FORM = 0.9;
// Detail is cut out with this many pixels of margin, so its antialiased edge comes with it.
const DETAIL_MARGIN = 2;
// Under this share of each cell agreeing on one colour, on average, the build warns.
const WARN_PURITY = 0.9;

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NO_DOT = '.';

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function aspect(svg: string): number {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
  if (vb) return Number(vb[2]) / Number(vb[1]);
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/.exec(svg);
  if (w && h) return Number(h[1]) / Number(w[1]);
  throw new Error('no size');
}

// Cell edges in pixels for `n` cells across `size` pixels.
const edges = (n: number, size: number) => Array.from({ length: n + 1 }, (_, i) => Math.round((i * size) / n));

type Built = { cols: number; rows: number; purity: number; palette: string[]; cells: string; detail: Buffer | null; detailShare: number };

async function build(svg: string): Promise<Built> {
  const ratio = aspect(svg);
  const W = RASTER_WIDTH;
  const H = Math.round(W * ratio);
  const pinned = svg.replace(/<svg\b[^>]*>/, (tag) => `${tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/g, '').slice(0, -1)} width="${W}" height="${H}">`);
  const { data } = await sharp(Buffer.from(pinned)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = W * H;

  // ── The flag's own colours ──
  const exact = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < count; i++) {
    if (data[i * 4 + 3] < 128) continue;
    opaque++;
    const k = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    exact.set(k, (exact.get(k) ?? 0) + 1);
  }
  const palette = [...exact].filter(([, n]) => n / opaque >= PALETTE_SHARE).sort((a, b) => b[1] - a[1]).map(([k]) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);

  // ── Every pixel's colour key: -1 transparent, a palette index, or a shade of its own ──
  const TRANSPARENT = -1;
  const keys = new Int32Array(count);
  const memo = new Map<number, number>();
  const shades: number[][] = [];
  const shadeIds = new Map<number, number>();
  const classify = (r: number, g: number, b: number): number => {
    let best = -1;
    let bestD = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const d = Math.hypot(r - palette[p][0], g - palette[p][1], b - palette[p][2]);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (bestD <= BLEND_DISTANCE) return best;
    // An antialiased edge: close to the line between two palette colours. It counts as the nearer.
    for (let a = 0; a < palette.length; a++) {
      for (let b2 = a + 1; b2 < palette.length; b2++) {
        const [ar, ag, ab] = palette[a];
        const dr = palette[b2][0] - ar, dg = palette[b2][1] - ag, db = palette[b2][2] - ab;
        const len = dr * dr + dg * dg + db * db;
        if (!len) continue;
        const t = Math.max(0, Math.min(1, ((r - ar) * dr + (g - ag) * dg + (b - ab) * db) / len));
        if (Math.hypot(r - (ar + t * dr), g - (ag + t * dg), b - (ab + t * db)) <= BLEND_DISTANCE) return t < 0.5 ? a : b2;
      }
    }
    const sk = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let id = shadeIds.get(sk);
    if (id === undefined) {
      id = palette.length + shades.length;
      shadeIds.set(sk, id);
      shades.push([0, 0, 0, 0]);
    }
    return id;
  };
  for (let i = 0; i < count; i++) {
    if (data[i * 4 + 3] < 128) {
      keys[i] = TRANSPARENT;
      continue;
    }
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const c = (r << 16) | (g << 8) | b;
    let k = memo.get(c);
    if (k === undefined) {
      k = classify(r, g, b);
      memo.set(c, k);
    }
    keys[i] = k;
    if (k >= palette.length) {
      const s = shades[k - palette.length];
      s[0] += r;
      s[1] += g;
      s[2] += b;
      s[3]++;
    }
  }
  const colourOf = (k: number) => (k < palette.length ? hex(palette[k][0], palette[k][1], palette[k][2]) : hex(shades[k - palette.length][0] / shades[k - palette.length][3], shades[k - palette.length][1] / shades[k - palette.length][3], shades[k - palette.length][2] / shades[k - palette.length][3]));

  // ── Shapes: 4-connected runs of one colour ──
  const label = new Int32Array(count).fill(-1);
  const shapeStart: number[] = [];
  const shapeSize: number[] = [];
  const order = new Int32Array(count);
  let filled = 0;
  for (let i = 0; i < count; i++) {
    if (keys[i] === TRANSPARENT || label[i] >= 0) continue;
    const id = shapeStart.length;
    shapeStart.push(filled);
    label[i] = id;
    order[filled++] = i;
    for (let q = shapeStart[id]; q < filled; q++) {
      const p = order[q];
      const x = p % W;
      const k = keys[p];
      for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (n < 0 || n >= count || label[n] >= 0 || keys[n] !== k) continue;
        label[n] = id;
        order[filled++] = n;
      }
    }
    shapeSize.push(filled - shapeStart[id]);
  }

  // ── One candidate grid: which shapes keep their form on it, and the dots it gives ──
  // Smallest shapes first, and what is already detail is left out of the larger shapes' test:
  // the canton is judged without its stars, the white band without its chakra.
  const byArea = shapeSize.map((_, i) => i).filter((s) => keys[order[shapeStart[s]]] !== TRANSPARENT).sort((a, b) => shapeSize[a] - shapeSize[b]);
  const KEY_OFFSET = 1; // so TRANSPARENT (-1) has a slot
  const counts = new Int32Array(palette.length + shades.length + 1);
  const judge = (cols: number, rows: number) => {
    const xs = edges(cols, W), ys = edges(rows, H);
    const colOf = new Int32Array(W), rowOf = new Int32Array(H);
    for (let c = 0; c < cols; c++) colOf.fill(c, xs[c], xs[c + 1]);
    for (let r = 0; r < rows; r++) rowOf.fill(r, ys[r], ys[r + 1]);
    const cellOf = (p: number) => rowOf[Math.floor(p / W)] * cols + colOf[p % W];

    const counted = new Int32Array(cols * rows); // pixels per cell still judged
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) counted[r * cols + c] = (xs[c + 1] - xs[c]) * (ys[r + 1] - ys[r]);
    const detail = new Uint8Array(count);
    let detailCount = 0;
    const inCell = new Int32Array(cols * rows);
    for (const s of byArea) {
      const touched: number[] = [];
      for (let q = shapeStart[s]; q < shapeStart[s] + shapeSize[s]; q++) {
        const c = cellOf(order[q]);
        if (inCell[c]++ === 0) touched.push(c);
      }
      let inter = 0;
      let snapped = 0;
      for (const c of touched) {
        if (inCell[c] * 2 >= counted[c]) {
          inter += inCell[c];
          snapped += counted[c];
        }
      }
      const iou = inter / (shapeSize[s] + snapped - inter);
      for (const c of touched) inCell[c] = 0;
      if (iou >= KEEPS_FORM) continue;
      for (let q = shapeStart[s]; q < shapeStart[s] + shapeSize[s]; q++) {
        const p = order[q];
        detail[p] = 1;
        counted[cellOf(p)]--;
      }
      detailCount += shapeSize[s];
    }

    // Each cell's dot: the colour covering most of what is not detail in it.
    const winners = new Int32Array(cols * rows).fill(-2); // -2: nothing but detail
    let agree = 0;
    let judged = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const touched: number[] = [];
        let n = 0;
        for (let py = ys[y]; py < ys[y + 1]; py++) {
          for (let px = xs[x]; px < xs[x + 1]; px++) {
            const p = py * W + px;
            if (detail[p]) continue;
            const k = keys[p] + KEY_OFFSET;
            if (counts[k]++ === 0) touched.push(k);
            n++;
          }
        }
        if (!n) continue;
        let win = touched[0];
        for (const k of touched) if (counts[k] > counts[win]) win = k;
        agree += counts[win] / n;
        judged++;
        winners[y * cols + x] = win - KEY_OFFSET;
        for (const k of touched) counts[k] = 0;
      }
    }
    return { cols, rows, detail, detailShare: detailCount / count, winners, purity: judged ? agree / judged : 1 };
  };

  // ── The grid: of those near the target size, the one that leaves least to detail, then whose
  // cells best keep to one colour, then nearest the target ──
  const rows0 = Math.sqrt(TARGET_DOTS * ratio);
  let best: ReturnType<typeof judge> | null = null;
  for (let rows = Math.max(1, Math.floor(rows0 * (1 - DOT_SPREAD))); rows <= Math.ceil(rows0 * (1 + DOT_SPREAD)); rows++) {
    const exactCols = rows / ratio;
    for (const cols of new Set([Math.floor(exactCols), Math.ceil(exactCols)])) {
      if (cols < 1 || Math.abs(cols / exactCols - 1) > SQUARE) continue;
      if (Math.abs((cols * rows) / TARGET_DOTS - 1) > DOT_SPREAD) continue;
      const m = judge(cols, rows);
      const better =
        !best ||
        m.detailShare < best.detailShare - 0.002 ||
        (Math.abs(m.detailShare - best.detailShare) <= 0.002 &&
          (m.purity > best.purity + 0.001 || (Math.abs(m.purity - best.purity) <= 0.001 && Math.abs(cols * rows - TARGET_DOTS) < Math.abs(best.cols * best.rows - TARGET_DOTS))));
      if (better) best = m;
    }
  }
  if (!best) throw new Error('no grid fits');
  const { detail } = best;
  const { cols, rows, winners } = best;

  // Cells that held only detail take the field around them, spreading in from their neighbours.
  for (;;) {
    const next = winners.slice();
    for (let i = 0; i < winners.length; i++) {
      if (winners[i] !== -2) continue;
      const x = i % cols, y = Math.floor(i / cols);
      const near = [x > 0 ? i - 1 : -1, x < cols - 1 ? i + 1 : -1, y > 0 ? i - cols : -1, y < rows - 1 ? i + cols : -1].find((n) => n >= 0 && winners[n] >= 0);
      if (near !== undefined) next[i] = winners[near];
    }
    if (next.every((v, i) => v === winners[i])) break;
    winners.set(next);
  }

  const used = new Map<string, number>();
  let cells = '';
  for (const k of winners) {
    if (k < 0) {
      cells += NO_DOT;
      continue;
    }
    const c = colourOf(k);
    let i = used.get(c);
    if (i === undefined) {
      i = used.size;
      used.set(c, i);
    }
    if (i >= ALPHABET.length) throw new Error('too many colours');
    cells += ALPHABET[i];
  }

  // ── The detail image: the rendered flag, kept only where (and just around where) detail is ──
  let detailCount = 0;
  const keep = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (!detail[i]) continue;
    detailCount++;
    const x = i % W, y = Math.floor(i / W);
    for (let dy = -DETAIL_MARGIN; dy <= DETAIL_MARGIN; dy++) {
      for (let dx = -DETAIL_MARGIN; dx <= DETAIL_MARGIN; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) keep[ny * W + nx] = 1;
      }
    }
  }
  let png: Buffer | null = null;
  if (detailCount) {
    const out = Buffer.from(data);
    for (let i = 0; i < count; i++) if (!keep[i]) out[i * 4 + 3] = 0;
    png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }

  return { cols, rows, purity: best.purity, palette: [...used.keys()], cells, detail: png, detailShare: detailCount / count };
}

async function main() {
  const names: Record<string, string> = JSON.parse(readFileSync(join(PKG, 'countries.json'), 'utf8'));
  const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;
  for (const dir of ['svg', 'data', 'detail']) {
    rmSync(join(PUBLIC, dir), { recursive: true, force: true });
    mkdirSync(join(PUBLIC, dir), { recursive: true });
  }

  const list: { code: string; name: string; ratio: number; detail: boolean }[] = [];
  for (const code of CODES) {
    const name = names[code.toUpperCase()];
    const svg = readFileSync(join(PKG, 'svg', `${code}.svg`), 'utf8');
    const header = `<!-- Flag of ${name}. From svg-country-flags@${version} (https://github.com/hjnilsson/country-flags), drawn after Wikipedia; public domain. -->\n`;
    writeFileSync(join(PUBLIC, 'svg', `${code}.svg`), header + svg);

    const b = await build(svg);
    writeFileSync(join(PUBLIC, 'data', `${code}.json`), JSON.stringify({ cols: b.cols, rows: b.rows, palette: b.palette, cells: b.cells }));
    if (b.detail) writeFileSync(join(PUBLIC, 'detail', `${code}.png`), b.detail);
    list.push({ code, name, ratio: Number(aspect(svg).toFixed(6)), detail: !!b.detail });
    const warn = b.purity < WARN_PURITY ? '  <- check the dot stage' : '';
    process.stdout.write(
      `${code}  ${name.padEnd(24)} ${String(b.cols).padStart(3)}x${String(b.rows).padEnd(3)} ${String(b.cells.replaceAll(NO_DOT, '').length).padStart(5)} dots  ${b.palette.length} colours  ${(b.purity * 100).toFixed(1)}% pure  detail ${(b.detailShare * 100).toFixed(1)}%${b.detail ? ` (${Math.round(b.detail.length / 1024)} KB)` : ''}${warn}\n`,
    );
  }

  writeFileSync(
    LIST,
    `// Generated by \`npm run flags\` from svg-country-flags. Do not edit by hand.\n\nexport type FlagEntry = {\n  code: string;\n  name: string;\n  /** height / width */\n  ratio: number;\n  /** Whether the flag has detail the dots cannot draw, laid over them from /flags/detail/<code>.png. */\n  detail: boolean;\n};\n\nexport const flags: FlagEntry[] = ${JSON.stringify(list, null, 2)};\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
