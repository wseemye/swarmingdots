import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyph } from '../src/morph/glyphs.ts';

const cp = (ch: string) => ch.codePointAt(0)!;

test('A decodes to its 84 pixels, cap height 19 cells, 16 cells wide', () => {
  const a = glyph(cp('A'))!;
  assert.equal(a.advance, 16);
  assert.equal(a.cells.length / 2, 84);
  const rows = [...a.cells].filter((_, i) => i % 2 === 1);
  assert.equal(Math.min(...rows), -19);
  assert.equal(Math.max(...rows), -1);
});

test('every pixel sits on the lattice, or on a half cell across (accents like the ring on Å)', () => {
  for (const ch of ['A', 'g', 'i', '@', 'Å']) {
    const cells = glyph(cp(ch))!.cells;
    for (let i = 0; i < cells.length; i += 2) {
      assert.ok(Number.isInteger(cells[i] * 2), `${ch} x`);
      assert.ok(Number.isInteger(cells[i + 1]), `${ch} y`);
    }
  }
  const ring = glyph(cp('Å'))!.cells;
  assert.ok([...ring].some((v, i) => i % 2 === 0 && v % 1 === 0.5), 'Å has half-cell pixels');
});

test('a space takes room but has no pixels; a character the font lacks is null', () => {
  const space = glyph(32)!;
  assert.equal(space.advance, 10);
  assert.equal(space.cells.length, 0);
  assert.equal(glyph(cp('😀')), null);
  assert.equal(glyph(cp('中')), null);
});

test('each character is decoded once and then reused', () => {
  assert.equal(glyph(cp('q')), glyph(cp('q')));
});
