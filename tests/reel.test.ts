import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DUR, CASCADE_MS, REEL_COLUMNS, Reel, widthOf } from '../src/casino/reel.ts';
import { glyph } from '../src/morph/glyphs.ts';

const adv = (s: string) => [...s].reduce((n, ch) => n + glyph(ch.codePointAt(0)!)!.advance, 0);
const done = DUR + CASCADE_MS + 100;
const dotsAt = (r: Reel, now: number) => {
  let n = 0;
  r.dots(now, () => {}, () => n++);
  return n;
};
const reelsOf = (s: string) => Math.ceil(adv(s) / REEL_COLUMNS);
const total = (s: string) => [...s].reduce((n, ch) => n + glyph(ch.codePointAt(0)!)!.cells.length / 2, 0);

test('the text columns are taken two at a time into reels, each two cells wide', () => {
  const r = new Reel();
  r.set('cat', 0);
  assert.equal(r.lines[0].length, reelsOf('cat'));
  assert.equal(r.tick(done), false);
  assert.equal(r.lineWidth(0, done), adv('cat'));
  assert.equal(dotsAt(r, done), total('cat'));
});

test('an edit moves only the dots that differ: same reels stay, and no reel is replaced wholesale', () => {
  const r = new Reel();
  r.set('cat', 0);
  r.tick(done);
  const before = [...r.lines[0]];
  const dots = (s: (typeof before)[number]) => s.movers.map((m) => `${m.dx},${m.y1}`).sort().join(' ');
  const was = before.map(dots);
  r.set('cot', done);
  assert.deepEqual(r.lines[0], before, 'the same reels are kept');
  const changed = r.lines[0].filter((s) => s.start === done);
  assert.ok(changed.length > 0 && changed.length < before.length);
  // Dots that were already where the new text wants them are not moved at all.
  r.lines[0].forEach((s, i) => {
    if (s.start !== done) assert.equal(dots(s), was[i]);
    for (const m of s.movers) if (m.a1 > 0 && m.y0 === m.y1) assert.equal(m.a0, 1);
  });
  // Dots that move slide within their column (no sideways travel, and the column keeps its dx).
  const moving = r.lines[0].flatMap((s) => s.movers.filter((m) => m.a1 > 0 && m.y0 !== m.y1 && m.a0 === 1));
  assert.ok(moving.length > 0);
  // Changed reels start left to right, each a touch after the one before.
  const starts = changed.map((s) => s.delay);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.ok(new Set(starts).size > 1);
  assert.equal(r.tick(done * 3), false);
  assert.equal(dotsAt(r, done * 3), total('cot'));
});

test('typing at the end opens columns; deleting closes them and they are gone once shut', () => {
  const r = new Reel();
  r.set('ab', 0);
  r.tick(done);
  r.set('abc', done);
  assert.equal(r.lines[0].length, reelsOf('abc'));
  assert.equal(widthOf(r.lines[0][reelsOf('ab')], done), 0);
  r.tick(3 * done);
  assert.equal(r.lineWidth(0, 3 * done), adv('abc'));
  r.set('ab', 3 * done);
  assert.equal(r.tick(3 * done), true);
  r.tick(6 * done);
  assert.equal(r.lines[0].length, reelsOf('ab'));
  assert.equal(dotsAt(r, 6 * done), total('ab'));
});

test('mid-roll edits carry on, with nothing lost or doubled once settled', () => {
  const r = new Reel();
  r.set('a', 0);
  r.set('b', 100);
  r.set('c', 200);
  assert.equal(r.tick(200 + done), false);
  assert.equal(dotsAt(r, 200 + done), total('c'));
});

test('lines roll too, and an emptied last line goes', () => {
  const r = new Reel();
  r.set('hi\nyo', 0);
  r.tick(done);
  assert.equal(r.extent().lines, 2);
  r.set('hi', done);
  r.tick(4 * done);
  assert.equal(r.lines.length, 1);
});

test('characters Geist Pixel cannot draw are left out', () => {
  const r = new Reel();
  r.set('a\u{1F600}b', 0);
  assert.equal(r.lines[0].length, reelsOf('ab'));
});
