import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COL_SPREAD, DUR, MAX_STAGGER, Reel, widthOf } from '../src/casino/reel.ts';
import { glyph } from '../src/morph/glyphs.ts';

const adv = (ch: string) => glyph(ch.codePointAt(0)!)!.advance;
const done = DUR + COL_SPREAD + MAX_STAGGER + 100;
const chars = (r: Reel) => r.lines.map((l) => l.map((s) => s.ch).join(''));
const count = (r: Reel, now: number) => {
  let n = 0;
  r.dots(now, () => {}, () => n++);
  return n;
};

test('a first text grows in from nothing and settles at its width', () => {
  const r = new Reel();
  r.set('cat', 0);
  assert.equal(r.lineWidth(0, 0), 0);
  assert.equal(r.tick(done), false);
  assert.equal(r.lineWidth(0, done), adv('c') + adv('a') + adv('t'));
  assert.equal(chars(r)[0], 'cat');
});

test('editing keeps the letters either side and rolls only what changed', () => {
  const r = new Reel();
  r.set('cat', 0);
  r.tick(done);
  const [c, a, t] = r.lines[0];
  r.set('cot', done);
  assert.equal(r.lines[0][0], c);
  assert.equal(r.lines[0][2], t);
  assert.equal(r.lines[0][1], a);
  assert.equal(a.ch, 'o');
  // The old letter is rolling out as the new one rolls in.
  assert.equal(a.layers.length, 2);
  assert.equal(r.tick(done + 2 * done), false);
  assert.equal(a.layers.length, 1);
});

test('typing at the end opens a slot; deleting closes it and it is gone once shut', () => {
  const r = new Reel();
  r.set('ab', 0);
  r.tick(done);
  r.set('abc', done);
  assert.equal(chars(r)[0], 'abc');
  assert.equal(widthOf(r.lines[0][2], done), 0);
  r.tick(3 * done);
  r.set('ab', 3 * done);
  assert.equal(r.tick(3 * done), true);
  r.tick(6 * done);
  assert.equal(r.lines[0].length, 2);
});

test('mid-roll edits carry on from where the dots are, with nothing lost or doubled when settled', () => {
  const r = new Reel();
  r.set('a', 0);
  r.set('b', 100);
  r.set('c', 200);
  assert.equal(r.tick(200 + done), false);
  assert.equal(r.lines[0][0].layers.length, 1);
  assert.equal(count(r, 200 + done) > 0, true);
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
  assert.equal(chars(r)[0], 'ab');
});
