import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atRest, springStep } from '../src/morph/spring.ts';

const one = (v: number) => new Float32Array([v]);

test('it heads straight for the target and never overshoots', () => {
  const now = one(0);
  const velocity = one(0);
  const to = one(1);
  let last = 0;
  for (let t = 0; t < 200; t++) {
    springStep(now, velocity, to, 0.01, 16);
    assert.ok(now[0] >= last - 1e-7, 'moves one way only');
    assert.ok(now[0] <= 1 + 1e-6, 'never past the target');
    last = now[0];
  }
  assert.ok(atRest(now, velocity, to));
});

test('it settles in about 7.5 time constants, which is what duration means', () => {
  const duration = 800;
  const omega = 7.5 / duration;
  const now = one(0);
  const velocity = one(0);
  springStep(now, velocity, one(1), omega, duration);
  assert.ok(1 - now[0] < 0.006, `within 0.6% after the duration, got ${now[0]}`);
});

test('the result does not depend on how the frames fall', () => {
  const a = { now: one(0), v: one(0) };
  const b = { now: one(0), v: one(0) };
  const to = one(1);
  springStep(a.now, a.v, to, 0.01, 160);
  for (let i = 0; i < 10; i++) springStep(b.now, b.v, to, 0.01, 16);
  assert.ok(Math.abs(a.now[0] - b.now[0]) < 1e-5);
  assert.ok(Math.abs(a.v[0] - b.v[0]) < 1e-7);
});

test('a new target mid-flight keeps the speed it had, so the motion bends instead of jumping', () => {
  const now = one(0);
  const velocity = one(0);
  springStep(now, velocity, one(1), 0.01, 100);
  const speed = velocity[0];
  const at = now[0];
  assert.ok(speed > 0);
  // Retarget backwards: it carries on forward for a moment before turning round.
  springStep(now, velocity, one(-1), 0.01, 1);
  assert.ok(now[0] > at, 'still moving forward just after the switch');
});
