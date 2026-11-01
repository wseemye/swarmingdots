import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// Builds the flags page's data from svg-country-flags (Wikipedia's flags, public domain, in their
// official proportions and colours), with the flags changed since it was last updated (2021) taken
// from scripts/flag-overrides/. For each flag it writes
//
//   public/flags/dots/<code>.png   one pixel per dot: the dot's colour, transparent for no dot
//
// and src/flags/list.ts, the flags the page offers.
//
// The flag is drawn entirely in dots, all the same size, and has to stay exact: a chakra keeps its
// 24 spokes, every star its five points. So there are a lot of dots (about 60,000 a flag), and each
// takes the colour of the flag rendered at exactly the grid's size: a dot wholly inside a field is
// that field's own colour, and a dot a fine line crosses takes its share of the line, as a pixel on
// a screen does. That keeps thin lines at an even weight whatever their angle, where giving each
// dot a single flag colour would break them up.

// Every flag in svg-country-flags except those that are not a country's or territory's current
// flag: the Netherlands Antilles (dissolved in 2010), Antarctica (no official flag) and the EU.
const EXCLUDE = new Set(['an', 'aq', 'eu']);

// Flags adopted since svg-country-flags was last updated, and one it draws in a way the renderer
// gets wrong; see each file for its source.
const OVERRIDES = new Set(['kg', 'ss', 'sy']);

// Names as people say them now, where the package has the long ISO form or an old name.
const NAMES: Record<string, string> = {
  bn: 'Brunei',
  bo: 'Bolivia',
  cd: 'DR Congo',
  cg: 'Republic of the Congo',
  cv: 'Cabo Verde',
  cz: 'Czechia',
  fk: 'Falkland Islands',
  fm: 'Micronesia',
  ir: 'Iran',
  kp: 'North Korea',
  kr: 'South Korea',
  la: 'Laos',
  md: 'Moldova',
  mk: 'North Macedonia',
  mo: 'Macau',
  ru: 'Russia',
  sh: 'Saint Helena, Ascension and Tristan da Cunha',
  sj: 'Svalbard and Jan Mayen',
  sx: 'Sint Maarten',
  sy: 'Syria',
  sz: 'Eswatini',
  tr: 'Türkiye',
  tz: 'Tanzania',
  va: 'Vatican City',
  ve: 'Venezuela',
  vg: 'British Virgin Islands',
  vi: 'U.S. Virgin Islands',
  vn: 'Vietnam',
  wf: 'Wallis and Futuna',
};

// Other names people search by.
const ALIASES: Record<string, string[]> = {
  ae: ['UAE', 'Emirates'],
  bn: ['Brunei Darussalam'],
  bo: ['Plurinational State of Bolivia'],
  cd: ['Democratic Republic of the Congo', 'Congo-Kinshasa', 'DRC', 'Zaire'],
  cg: ['Congo', 'Congo-Brazzaville'],
  ci: ['Ivory Coast'],
  cv: ['Cape Verde'],
  cz: ['Czech Republic'],
  de: ['Deutschland'],
  fk: ['Malvinas'],
  gb: ['UK', 'Britain', 'Great Britain'],
  'gb-eng': ['England'],
  ir: ['Persia'],
  kp: ['DPRK'],
  kr: ['Korea', 'Republic of Korea'],
  mk: ['Macedonia'],
  mm: ['Burma'],
  nl: ['Holland'],
  ru: ['Russian Federation'],
  sz: ['Swaziland'],
  tl: ['East Timor'],
  tr: ['Turkey'],
  us: ['USA', 'US', 'America', 'United States of America'],
  va: ['Holy See'],
  vn: ['Viet Nam'],
};

const PKG = join(process.cwd(), 'node_modules', 'svg-country-flags');
const OUT = join(process.cwd(), 'public', 'flags', 'dots');
const LIST = join(process.cwd(), 'src', 'flags', 'list.ts');

// Every flag gets about this many dots. The page shows every flag at the same area, so the same
// count means the same dot size from flag to flag.
const TARGET_DOTS = 60000;
// Grids tried: dot counts within this share of the target, cells within 2% of square.
const DOT_SPREAD = 0.06;
const SQUARE = 0.02;
// Colours covering at least this share of the flag are its own; the grid that puts the most dots
// wholly on one of them (stripes landing on whole rows) wins.
const PALETTE_SHARE = 0.002;

function aspect(svg: string): number {
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
  if (vb) return Number(vb[2]) / Number(vb[1]);
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/.exec(svg);
  if (w && h) return Number(h[1]) / Number(w[1]);
  throw new Error('no size');
}

function render(svg: string, width: number, height: number) {
  const sized = svg.replace(/<svg\b[^>]*>/, (tag) => `${tag.replace(/\s(width|height|preserveAspectRatio)\s*=\s*["'][^"']*["']/g, '').slice(0, -1)} width="${width}" height="${height}" preserveAspectRatio="none">`);
  return sharp(Buffer.from(sized)).ensureAlpha().raw().toBuffer();
}

async function build(svg: string) {
  const ratio = aspect(svg);

  // The flag's own colours, from a large render.
  const big = await render(svg, 1200, Math.round(1200 * ratio));
  const counts = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i < big.length; i += 4) {
    if (big[i + 3] < 250) continue;
    opaque++;
    const k = (big[i] << 16) | (big[i + 1] << 8) | big[i + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const palette = new Set([...counts].filter(([, n]) => n / opaque >= PALETTE_SHARE).map(([k]) => k));

  const rows0 = Math.sqrt(TARGET_DOTS * ratio);
  let best: { cols: number; rows: number; pure: number; data: Buffer } | null = null;
  for (let rows = Math.floor(rows0 * (1 - DOT_SPREAD / 2)); rows <= Math.ceil(rows0 * (1 + DOT_SPREAD / 2)); rows++) {
    const exactCols = rows / ratio;
    for (const cols of new Set([Math.floor(exactCols), Math.ceil(exactCols)])) {
      if (Math.abs(cols / exactCols - 1) > SQUARE || Math.abs((cols * rows) / TARGET_DOTS - 1) > DOT_SPREAD) continue;
      const data = await render(svg, cols, rows);
      let pure = 0;
      let dots = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue;
        dots++;
        if (data[i + 3] === 255 && palette.has((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])) pure++;
      }
      const share = pure / dots;
      if (!best || share > best.pure + 0.0005 || (Math.abs(share - best.pure) <= 0.0005 && Math.abs(cols * rows - TARGET_DOTS) < Math.abs(best.cols * best.rows - TARGET_DOTS))) {
        best = { cols, rows, pure: share, data };
      }
    }
  }
  if (!best) throw new Error('no grid fits');

  // A dot is there or not: no half-transparent dots at the edge of a flag that is not a rectangle.
  const { cols, rows, data } = best;
  for (let i = 0; i < data.length; i += 4) data[i + 3] = data[i + 3] < 128 ? 0 : 255;
  let dots = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]) dots++;
  const png = await sharp(data, { raw: { width: cols, height: rows, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { cols, rows, dots, pure: best.pure, png };
}

async function main() {
  const names: Record<string, string> = JSON.parse(readFileSync(join(PKG, 'countries.json'), 'utf8'));
  rmSync(join(process.cwd(), 'public', 'flags'), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const codes = Object.keys(names)
    .map((c) => c.toLowerCase())
    .filter((c) => !EXCLUDE.has(c));
  const list: { code: string; name: string; aliases?: string[]; ratio: number }[] = [];
  for (const code of codes) {
    const name = NAMES[code] ?? names[code.toUpperCase()];
    const svg = readFileSync(OVERRIDES.has(code) ? join(process.cwd(), 'scripts', 'flag-overrides', `${code}.svg`) : join(PKG, 'svg', `${code}.svg`), 'utf8');
    const b = await build(svg);
    writeFileSync(join(OUT, `${code}.png`), b.png);
    list.push({ code, name, ...(ALIASES[code] ? { aliases: ALIASES[code] } : {}), ratio: Number(aspect(svg).toFixed(6)) });
    process.stdout.write(
      `${code}  ${name.padEnd(24)} ${String(b.cols).padStart(3)}x${String(b.rows).padEnd(3)} ${String(b.dots).padStart(6)} dots  ${(b.pure * 100).toFixed(1)}% in the flag's own colours  ${(b.png.length / 1024).toFixed(1)} KB\n`,
    );
  }

  list.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  writeFileSync(
    LIST,
    `// Generated by \`npm run flags\` from svg-country-flags. Do not edit by hand.\n\nexport type FlagEntry = {\n  code: string;\n  name: string;\n  /** Other names it is searched by. */\n  aliases?: string[];\n  /** height / width */\n  ratio: number;\n};\n\nexport const flags: FlagEntry[] = ${JSON.stringify(list, null, 2)};\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(1);
});
