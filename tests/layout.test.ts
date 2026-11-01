import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyph } from '../src/morph/glyphs.ts';
import { CELL_EM, layout, LINE_ASCENT, LINE_DESCENT, normalize, type LayoutOptions } from '../src/morph/layout.ts';

const cell = 100 * CELL_EM;
const options = (o: Partial<LayoutOptions> = {}): LayoutOptions => ({ cell, letterSpacing: 0, lineSpacing: 10, maxWidth: Infinity, align: 'left', ...o });
const advances = (text: string) => [...text].reduce((w, ch) => w + glyph(ch.codePointAt(0)!)!.advance * cell, 0);

test('a line is as wide as its characters, plus letter spacing between them', () => {
  assert.ok(Math.abs(layout('Geist', options()).width - advances('Geist')) < 1e-6);
  const spaced = layout('Geist', options({ letterSpacing: 7 })).width;
  assert.ok(Math.abs(spaced - (advances('Geist') + 4 * 7)) < 1e-6);
});

test('one pixel per glyph pixel, and a source for each pointing back at its character', () => {
  const l = layout('Ai', options());
  const a = glyph('A'.codePointAt(0)!)!.cells.length / 2;
  const i = glyph('i'.codePointAt(0)!)!.cells.length / 2;
  assert.equal(l.pixels.length / 2, a + i);
  assert.deepEqual([...new Set(l.sources)], [0, 1]);
});

test('lines wrap between words, and the spaces at the break are dropped', () => {
  const l = layout('Geist Pixel', options({ maxWidth: advances('Geist') + 1 }));
  assert.equal(l.lines.length, 2);
  assert.equal(l.lines[0].chars.map((c) => c.ch).join(''), 'Geist');
  assert.equal(l.lines[1].chars.map((c) => c.ch).join(''), 'Pixel');
  assert.equal(l.height, 2 * (LINE_ASCENT + LINE_DESCENT) * cell + 10);
});

test('a word too wide for any line is cut between letters', () => {
  const l = layout('Geist', options({ maxWidth: advances('Ge') + 1 }));
  assert.deepEqual(
    l.lines.map((line) => line.chars.map((c) => c.ch).join('')),
    ['Ge', 'is', 't'],
  );
});

test('newlines start lines, and an empty line still takes its room', () => {
  const l = layout('a\n\nb', options());
  assert.equal(l.lines.length, 3);
  assert.equal(l.lines[1].chars.length, 0);
  // Sources count the newlines: a is 0, b is 3.
  assert.deepEqual([...new Set(l.sources)], [0, 3]);
});

test('characters the font lacks are reported and left out', () => {
  const l = layout('a😀b', options());
  assert.deepEqual(l.missing, ['😀']);
  assert.equal(l.lines[0].chars.map((c) => c.ch).join(''), 'ab');
});

test('centred and right-aligned lines move over by the room they leave', () => {
  const text = 'Geist\nPi';
  const left = layout(text, options());
  const centre = layout(text, options({ align: 'center' }));
  const right = layout(text, options({ align: 'right' }));
  const gap = left.width - advances('Pi');
  assert.equal(centre.lines[1].x, gap / 2);
  assert.equal(right.lines[1].x, gap);
});

test('text is composed before layout, so e + combining acute is é', () => {
  assert.equal(normalize('é'), 'é');
  assert.equal(normalize('a\r\nb'), 'a\nb');
  assert.deepEqual(layout('é', options()).missing, []);
});

test('no text lays out to nothing, without errors', () => {
  const l = layout('', options());
  assert.equal(l.pixels.length, 0);
  assert.equal(l.width, 0);
});
