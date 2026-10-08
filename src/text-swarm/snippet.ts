export type Settings = {
  /** What to show. Newlines start a new line; words are split on whitespace. */
  text: string;
  /** Font size in px; a dot is 0.038 of it. */
  fontSize: number;
  /** Page background, `#rrggbb`. */
  background: string;
  /** Dot and text colour, `#rrggbb`. */
  color: string;
  /** Extra space after every letter, in dots. */
  letterSpacing: number;
  /** Gap between one line and the next, in dots. */
  lineSpacing: number;
};

export const DEFAULT_TEXT = 'the quick brown fox jumps over the lazy dog';

export const DEFAULT_SETTINGS: Settings = {
  text: DEFAULT_TEXT,
  fontSize: 26,
  background: '#ffffff',
  color: '#000000',
  letterSpacing: 0,
  lineSpacing: 6,
};

const FONT_URL = 'https://cdn.jsdelivr.net/npm/geist@1.7.2/dist/fonts/geist-pixel/GeistPixel-Circle.woff2';

/** The dot size these settings produce, for display. */
export function dotPx(fontSize: number): number {
  return fontSize * 0.038;
}

// A standalone page. It needs no build step and no assets of its own: the font
// comes from the `geist` package on a CDN, and the dot layout is read back out of
// the font at load by drawing each letter on a canvas and sampling one pixel per
// lattice cell. Written without template literals so it can sit inside this one.
export function buildSnippet(s: Settings): string {
  const config = JSON.stringify(
    {
      text: s.text,
      fontSize: s.fontSize,
      color: s.color,
      letterSpacing: s.letterSpacing,
      lineSpacing: s.lineSpacing,
      introMs: 800,
      swarmMs: 1100,
      fadeMs: 350,
    },
    null,
    2,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dot swarm text</title>
<style>
  @font-face {
    font-family: "Geist Pixel Circle";
    src: url("${FONT_URL}") format("woff2");
    font-display: block;
  }
  html, body { height: 100%; margin: 0; }
  body { display: flex; background: ${s.background}; }
  h1 { box-sizing: border-box; margin: auto; padding: 24px; min-width: 0; max-width: 100%; font-size: 0; line-height: 0; font-weight: 400; }
  .w { position: relative; display: inline-block; }
  .w canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
  .w .t {
    position: absolute; font-family: "Geist Pixel Circle", monospace; font-weight: 400;
    line-height: 1; white-space: pre; font-kerning: none; font-variant-ligatures: none;
  }
</style>
</head>
<body>
<h1 id="sentence"></h1>
<script>
// Change these. Everything else is derived from fontSize: one dot is 0.038em, so
// 26px gives ~1px dots and 16px gives ~0.6px dots. The dot count never changes.
// letterSpacing is in dots, and so is lineSpacing (the gap between lines).
var CONFIG = ${config};

var PIXEL_EM = 0.038;   // one lattice step of Geist Pixel, in em
var BOX_ROWS = 10;      // the skeleton box is always 10 dots tall
var CELL = 8;           // canvas px per lattice step while sampling the font
var ASC = 26, DESC = 8; // rows above and below the baseline that any letter can use
var FONT = '"Geist Pixel Circle"';

function ease(t) { return t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2; }

// Reads a word's dots out of the font: draw each letter, keep a cell if its centre is inked.
// Letters the font cannot draw come back blank and are dropped.
function rasterize(word) {
  var size = CELL / PIXEL_EM, PAD = 2, COLS = 48, ROWS = ASC + DESC;
  var c = document.createElement('canvas');
  c.width = COLS * CELL; c.height = ROWS * CELL;
  var g = c.getContext('2d', { willReadFrequently: true });
  g.font = size + 'px ' + FONT;
  var cells = [], kept = '', origin = 0;
  Array.from(word).forEach(function (ch) {
    var adv = Math.round(g.measureText(ch).width / CELL);
    g.clearRect(0, 0, c.width, c.height);
    g.fillText(ch, PAD * CELL, ASC * CELL);
    var data = g.getImageData(0, 0, c.width, c.height).data, found = [], on = [], x, y;
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      if (data[((y * CELL + CELL / 2) * c.width + x * CELL + CELL / 2) * 4 + 3] > 128) on.push([x, y]);
    }
    // A letter the font lacks gets drawn in some other font. Real glyphs ink whole cells only,
    // so drop a glyph whose ink mostly lies outside the cells it inks.
    var ink = 0, inCells = 0, i;
    for (i = 3; i < data.length; i += 4) if (data[i] > 128) ink++;
    on.forEach(function (p) {
      for (var dy = 0; dy < CELL; dy++) for (var dx = 0; dx < CELL; dx++) {
        if (data[((p[1] * CELL + dy) * c.width + p[0] * CELL + dx) * 4 + 3] > 128) inCells++;
      }
    });
    if (!on.length || inCells < ink * 0.98) return;
    on.forEach(function (p) { found.push([origin + p[0] - PAD, p[1], kept.length]); });
    cells = cells.concat(found); kept += ch; origin += adv;
  });
  if (!cells.length) return null;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(function (p) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });
  return {
    cells: cells.map(function (p) { return [p[0] - minX, p[1] - minY, p[2]]; }),
    cols: maxX - minX + 1, rows: maxY - minY + 1,
    baseline: ASC - minY,   // rows from the top of the word down to the baseline
    inkLeft: minX,          // dots between the text origin and the first ink
    kept: kept, length: kept.length
  };
}

// A word wider than the page is cut between letters into the fewest pieces that each fit,
// so the text wraps inside the page instead of scrolling sideways.
function split(w, maxCols) {
  var ls = CONFIG.letterSpacing;
  if (w.length < 2 || w.cols + (w.length - 1) * ls <= maxCols) return [w];
  var lo = [], hi = [];
  w.cells.forEach(function (p) {
    var g = p[2];
    lo[g] = lo[g] === undefined ? p[0] : Math.min(lo[g], p[0]);
    hi[g] = hi[g] === undefined ? p[0] : Math.max(hi[g], p[0]);
  });
  var letters = Array.from(w.kept), out = [];
  for (var a = 0; a < letters.length; ) {
    var b = a;
    while (b + 1 < letters.length && hi[b + 1] - lo[a] + 1 + (b + 1 - a) * ls <= maxCols) b++;
    var piece = rasterize(letters.slice(a, b + 1).join(''));
    if (piece) out.push(piece);
    a = b + 1;
  }
  return out.length ? out : [w];
}

// The skeleton: the word's own dots packed into 10 rows, sitting on the x-height band.
function boxCells(count, baseline) {
  var out = [], top = baseline - 12;
  for (var r = 0; r < BOX_ROWS; r++) {
    var inRow = Math.floor(count / BOX_ROWS) + (r < count % BOX_ROWS ? 1 : 0);
    for (var k = 0; k < inRow; k++) out.push([k, top + r]);
  }
  return out;
}

function build(w, host, isLast) {
  var fs = CONFIG.fontSize, dot = fs * PIXEL_EM, ls = CONFIG.letterSpacing;
  var n = w.cells.length;
  var boxCols = Math.ceil(n / BOX_ROWS);
  var wordCols = w.cols + (w.length - 1) * ls;

  var wrap = document.createElement('span');
  wrap.className = 'w';
  wrap.style.height = w.rows * dot + 'px';
  wrap.style.verticalAlign = -(w.rows - w.baseline) * dot + 'px';
  wrap.style.marginRight = isLast ? '0' : Math.max(4, 8 + 2 * ls) * dot + 'px';
  wrap.style.marginBottom = CONFIG.lineSpacing * dot + 'px';
  wrap.style.width = boxCols * dot + 'px';

  var canvas = document.createElement('canvas');
  var dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
  var cw = wordCols * dot, ch = w.rows * dot;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.max(1, Math.ceil(cw * dpr)); canvas.height = Math.max(1, Math.ceil(ch * dpr));
  var ctx = canvas.getContext('2d');

  var text = document.createElement('span');
  text.className = 't';
  text.textContent = isLast ? w.kept : w.kept + ' ';
  text.style.fontSize = fs + 'px';
  text.style.left = -w.inkLeft * dot + 'px';
  text.style.color = CONFIG.color;
  text.style.letterSpacing = ls * dot + 'px';
  text.style.opacity = '0';
  text.style.transition = 'opacity ' + CONFIG.fadeMs + 'ms ease-out';

  wrap.appendChild(canvas);
  wrap.appendChild(text);
  host.appendChild(wrap);

  // Browsers round a font's ascent to whole pixels, so measure where the baseline
  // really falls and put it on the word's baseline row.
  var probe = document.createElement('span');
  probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  text.appendChild(probe);
  text.style.top = w.baseline * dot - (probe.getBoundingClientRect().bottom - text.getBoundingClientRect().top) + 'px';
  probe.remove();

  // Scatter: each dot heads for an arbitrary cell, so dots cross the field and reassemble.
  var from = boxCells(n, w.baseline);
  var to = w.cells.slice();
  for (var i = n - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = to[i]; to[i] = to[j]; to[j] = tmp;
  }

  function draw(e) {
    ctx.setTransform(canvas.width / cw, 0, 0, canvas.height / ch, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = CONFIG.color;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var x = from[i][0] + (to[i][0] + to[i][2] * ls - from[i][0]) * e;
      var y = from[i][1] + (to[i][1] - from[i][1]) * e;
      ctx.roundRect(x * dot, y * dot, dot, dot, dot * 0.4);
    }
    ctx.fill();
    wrap.style.width = (boxCols + (wordCols - boxCols) * e) * dot + 'px';
  }

  draw(0);
  return { start: function () {
    var t0 = null;
    function frame(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / CONFIG.swarmMs);
      draw(ease(t));
      if (t < 1) return requestAnimationFrame(frame);
      // The text fades in over the settled dots; only then do the dots leave.
      text.style.opacity = '1';
      setTimeout(function () { canvas.remove(); }, CONFIG.fadeMs + 80);
    }
    requestAnimationFrame(frame);
  } };
}

document.fonts.load(CONFIG.fontSize + 'px ' + FONT).then(function () {
  var host = document.getElementById('sentence'), parts = [];
  var maxCols = Math.floor((document.documentElement.clientWidth - 48) / (CONFIG.fontSize * PIXEL_EM));
  CONFIG.text.split('\\n').forEach(function (line, li) {
    var words = line.split(/\\s+/).filter(Boolean).map(rasterize).filter(Boolean);
    if (!words.length) return;
    if (parts.length) host.appendChild(document.createElement('br'));
    words.forEach(function (w, i) {
      var pieces = split(w, maxCols);
      pieces.forEach(function (piece, k) {
        parts.push(build(piece, host, i === words.length - 1 && k === pieces.length - 1));
      });
    });
  });
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(function () {
    parts.forEach(function (p) { p.start(); });
  }, reduced ? 0 : CONFIG.introMs);
});
</script>
</body>
</html>
`;
}

export function buildPrompt(s: Settings): string {
  const dot = dotPx(s.fontSize);
  return `Build a single self-contained HTML page (no build step, no framework) that shows this text: """
${s.text}
"""
as an animated dot-swarm text effect.

Visual settings:
- Font size: ${s.fontSize}px (one dot = font size × 0.038 = ${dot.toFixed(3)}px)
- Background: ${s.background}
- Dot and text colour: ${s.color}
- Letter spacing: ${s.letterSpacing} dots (${(s.letterSpacing * dot).toFixed(3)}px) added after every letter
- Line spacing: ${s.lineSpacing} dots (${(s.lineSpacing * dot).toFixed(3)}px) of empty space between one line and the next

The font is Geist Pixel Circle (weight 400), loaded with @font-face from ${FONT_URL}. It is a pixel font on a lattice of 38/1000 em, so one dot is exactly one lattice step, and the dot count never changes when the font size does: only the size each dot is drawn at.

Behaviour:
1. Each word starts as a skeleton box: a solid block of dots, always 10 rows tall, with just as many dots as the word itself will need (so the dots map one-to-one), filled row by row with any extra dots going to the top rows. Boxes sit left-aligned on a shared horizontal band and are spaced by their own widths.
2. After 800ms, all words swarm at the same time over 1100ms. Each dot travels from its place in the box to an arbitrary dot of the word (shuffle the targets so dots cross the field and reassemble), using a quintic ease-in-out. While swarming, each word's slot in the line grows from its box width to its final word width.
3. Once the dots have settled, fade the real text in over the dots (350ms), then remove the dots. Each word is one plain text node in Geist Pixel Circle at the chosen size, so it stays selectable and copyable as a normal sentence. Position it so its baseline lands on the dots' baseline: measure the real baseline offset with a zero-height inline-block probe, because browsers round font ascent to whole pixels.
4. Dots are rounded squares (corner radius 0.4 of a dot) drawn as vector paths on a canvas with a backing store of at least 3x, so they stay crisp at ~1px.
5. Words flow and wrap like inline text, aligned on their baselines (descenders hang below), with a gap of max(4, 8 + 2 × letter spacing) dots between words, so words stay clearly apart when letters are spaced out. A word wider than the page is cut between letters into the fewest pieces that each fit, so nothing ever scrolls sideways. Respect prefers-reduced-motion by skipping the swarm.

To get each word's dots without a data file, rasterise it from the font at load: draw each letter on an offscreen canvas (tall enough for 26 rows above the baseline and 8 below) at font size ${(8 / 0.038).toFixed(3)}px (8 canvas px per lattice step), advance by each letter's measured width, and keep a lattice cell if the pixel at its centre is inked. Letters with no ink (not in the font) are dropped. Newlines in the text start a new line; words are split on whitespace.`;
}
