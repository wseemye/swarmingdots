import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isStraight, NOTHING, shapeFor, SHAPES, VARIANTS } from '../src/morph/variants.ts';

const point = (s: Float32Array, k: number) => [s[k * 4], s[k * 4 + 1]];

test('every face is eight quadratic sides inside its cell', () => {
  for (const v of VARIANTS) {
    const s = SHAPES[v];
    assert.equal(s.length, 32, v);
    for (const n of s) assert.ok(n >= 0 && n <= 1, `${v} ${n}`);
  }
});

test('the polygons are straight-sided and the circle is not', () => {
  for (const v of ['square', 'grid', 'line', 'triangle'] as const) assert.ok(isStraight(SHAPES[v]), v);
  assert.ok(!isStraight(SHAPES.circle));
  assert.ok(isStraight(NOTHING));
});

test('each face matches the font: corners, insets and half cells', () => {
  assert.deepEqual(point(SHAPES.square, 1), [1, 0]);
  const g = point(SHAPES.grid, 7).map((n) => Math.round(n * 38));
  assert.deepEqual(g, [4, 4]);
  assert.deepEqual(point(SHAPES.line, 0), [0.5, 0.5]);
  assert.deepEqual(point(SHAPES.triangle, 0), [0.5, 0]);
  // The font's quadratic circle passes through 0.875, 0.125 between top and right.
  assert.deepEqual(point(SHAPES.circle, 1), [0.875, 0.125]);
});

test('into or out of the circle, rectangles are written to round off smoothly but draw the same', () => {
  for (const v of ['square', 'grid', 'line'] as const) {
    const plain = SHAPES[v];
    const rounding = shapeFor(v, 'circle');
    assert.notDeepEqual([...rounding], [...plain], v);
    // Same corners and middles (the points drawn through), so the same shape at rest.
    for (let k = 0; k < 8; k++) assert.deepEqual(point(rounding, k), point(plain, k), `${v} point ${k}`);
    assert.ok(isStraight(rounding), v);
  }
  assert.equal(shapeFor('square', 'triangle'), SHAPES.square);
  assert.equal(shapeFor('triangle', 'circle'), SHAPES.triangle);
});
