import { WORDS } from './words';

export type Settings = {
  /** Font size in px; a dot is 0.038 of it. */
  fontSize: number;
  /** Page background, `#rrggbb`. */
  background: string;
  /** Dot and text colour, `#rrggbb`. */
  color: string;
  /** Extra space after every letter, in dots. */
  letterSpacing: number;
};

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 26,
  background: '#ffffff',
  color: '#000000',
  letterSpacing: 0,
};

export const SENTENCE = WORDS.map((w) => w.text).join(' ');

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
      text: SENTENCE,
      fontSize: s.fontSize,
      color: s.color,
      letterSpacing: s.letterSpacing,
      introMs: 800,
      morphMs: 1100,
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
<title>Dot matrix text</title>
<style>
  @font-face {
    font-family: "Geist Pixel Circle";
    src: url("${FONT_URL}") format("woff2");
    font-display: block;
  }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: ${s.background}; }
  h1 { margin: 0; padding: 24px; max-width: 100%; font-size: 0; line-height: 0; font-weight: 400; }
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
// letterSpacing is in dots.
var CONFIG = ${config};

var PIXEL_EM = 0.038;   // one lattice step of Geist Pixel, in em
var BOX_ROWS = 10;      // the skeleton box is always 10 dots tall
var CELL = 8;           // canvas px per lattice step while sampling the font
var ASC = 19, DESC = 4; // rows above and below the baseline that any letter can use
var FONT = '"Geist Pixel Circle"';

function ease(t) { return t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2; }

// Reads a word's dots out of the font: draw each letter, keep a cell if its centre is inked.
function rasterize(word) {
  var size = CELL / PIXEL_EM;
  var probe = document.createElement('canvas').getContext('2d');
  probe.font = size + 'px ' + FONT;
  var letters = word.split('');
  var adv = letters.map(function (ch) { return Math.round(probe.measureText(ch).width / CELL); });
  var total = adv.reduce(function (a, b) { return a + b; }, 0);
  var pad = 2, cols = total + pad * 2, rows = ASC + DESC;
  var c = document.createElement('canvas');
  c.width = cols * CELL; c.height = rows * CELL;
  var g = c.getContext('2d', { willReadFrequently: true });
  g.font = probe.font;
  var cells = [], origin = pad;
  letters.forEach(function (ch, gi) {
    g.clearRect(0, 0, c.width, c.height);
    g.fillText(ch, origin * CELL, ASC * CELL);
    var data = g.getImageData(0, 0, c.width, c.height).data;
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      if (data[((y * CELL + CELL / 2) * c.width + x * CELL + CELL / 2) * 4 + 3] > 128) cells.push([x, y, gi]);
    }
    origin += adv[gi];
  });
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  cells.forEach(function (p) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  });
  return {
    cells: cells.map(function (p) { return [p[0] - minX, p[1] - minY, p[2]]; }),
    cols: maxX - minX + 1, rows: maxY - minY + 1,
    baseline: ASC - minY,   // rows from the top of the word down to the baseline
    inkLeft: minX - pad,    // dots between the text origin and the first ink
    length: letters.length
  };
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

function build(wordText, isLast) {
  var w = rasterize(wordText);
  var fs = CONFIG.fontSize, dot = fs * PIXEL_EM, ls = CONFIG.letterSpacing;
  var n = w.cells.length;
  var boxCols = Math.ceil(n / BOX_ROWS);
  var wordCols = w.cols + (w.length - 1) * ls;

  var wrap = document.createElement('span');
  wrap.className = 'w';
  wrap.style.height = w.rows * dot + 'px';
  wrap.style.verticalAlign = -(w.rows - w.baseline) * dot + 'px';
  wrap.style.marginRight = isLast ? '0' : Math.max(4, 8 + 2 * ls) * dot + 'px';
  wrap.style.marginBottom = 6 * dot + 'px';
  wrap.style.width = boxCols * dot + 'px';

  var canvas = document.createElement('canvas');
  var dpr = Math.min(Math.max(window.devicePixelRatio || 1, 3), 4);
  var cw = wordCols * dot, ch = w.rows * dot;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.max(1, Math.ceil(cw * dpr)); canvas.height = Math.max(1, Math.ceil(ch * dpr));
  var ctx = canvas.getContext('2d');

  var text = document.createElement('span');
  text.className = 't';
  text.textContent = isLast ? wordText : wordText + ' ';
  text.style.fontSize = fs + 'px';
  text.style.left = -w.inkLeft * dot + 'px';
  text.style.color = CONFIG.color;
  text.style.letterSpacing = ls * dot + 'px';
  text.style.opacity = '0';
  text.style.transition = 'opacity ' + CONFIG.fadeMs + 'ms ease-out';

  wrap.appendChild(canvas);
  wrap.appendChild(text);
  document.getElementById('sentence').appendChild(wrap);

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
      var t = Math.min(1, (now - t0) / CONFIG.morphMs);
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
  var words = CONFIG.text.split(' ');
  var parts = words.map(function (word, i) { return build(word, i === words.length - 1); });
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
  return `Build a single self-contained HTML page (no build step, no framework) that shows the sentence "${SENTENCE}" as an animated dot-matrix text effect.

Visual settings:
- Font size: ${s.fontSize}px (one dot = font size × 0.038 = ${dot.toFixed(3)}px)
- Background: ${s.background}
- Dot and text colour: ${s.color}
- Letter spacing: ${s.letterSpacing} dots (${(s.letterSpacing * dot).toFixed(3)}px) added after every letter

The font is Geist Pixel Circle (weight 400), loaded with @font-face from ${FONT_URL}. It is a pixel font on a lattice of 38/1000 em, so one dot is exactly one lattice step, and the dot count never changes when the font size does: only the size each dot is drawn at.

Behaviour:
1. Each word starts as a skeleton box: a solid block of dots, always 10 rows tall, with just as many dots as the word itself will need (so the dots map one-to-one), filled row by row with any extra dots going to the top rows. Boxes sit left-aligned on a shared horizontal band and are spaced by their own widths.
2. After 800ms, all words morph at the same time over 1100ms. Each dot travels from its place in the box to an arbitrary dot of the word (shuffle the targets so dots cross the field and reassemble), using a quintic ease-in-out. While morphing, each word's slot in the line grows from its box width to its final word width.
3. Once the dots have settled, fade the real text in over the dots (350ms), then remove the dots. Each word is one plain text node in Geist Pixel Circle at the chosen size, so it stays selectable and copyable as a normal sentence. Position it so its baseline lands on the dots' baseline: measure the real baseline offset with a zero-height inline-block probe, because browsers round font ascent to whole pixels.
4. Dots are rounded squares (corner radius 0.4 of a dot) drawn as vector paths on a canvas with a backing store of at least 3x, so they stay crisp at ~1px.
5. Words flow and wrap like inline text, aligned on their baselines (descenders hang below), with a gap of max(4, 8 + 2 × letter spacing) dots between words, so words stay clearly apart when letters are spaced out. Respect prefers-reduced-motion by skipping the morph.

To get each word's dots without a data file, rasterise it from the font at load: draw each letter on an offscreen canvas at font size ${(8 / 0.038).toFixed(3)}px (8 canvas px per lattice step), advance by each letter's measured width, and keep a lattice cell if the pixel at its centre is inked.`;
}
