import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS } from '../src/morph-editor/settings.ts';
import { snippet } from '../src/morph-editor/snippet.ts';
import { readSettings, writeSettings } from '../src/morph-editor/url.ts';

test('the defaults write an empty query, and read back as the defaults', () => {
  assert.equal(writeSettings(DEFAULT_SETTINGS), '');
  assert.deepEqual(readSettings(''), DEFAULT_SETTINGS);
});

test('settings survive a trip through the link', () => {
  const s = { ...DEFAULT_SETTINGS, text: 'Hello\n"world"', variant: 'circle' as const, fontSize: 96, letterSpacing: 4, color: '#ff0055', background: '#111111', align: 'left' as const, duration: 1200 };
  assert.deepEqual(readSettings(writeSettings(s)), s);
});

test('bad values in a link are ignored or kept in range', () => {
  const s = readSettings('?face=wobbly&size=99999&letter=abc&color=zzz&bg=0f0&duration=-5');
  assert.equal(s.variant, DEFAULT_SETTINGS.variant);
  assert.equal(s.fontSize, 320);
  assert.equal(s.letterSpacing, DEFAULT_SETTINGS.letterSpacing);
  assert.equal(s.color, DEFAULT_SETTINGS.color);
  assert.equal(s.background, '#00ff00');
  assert.equal(s.duration, 200);
});

test('the copied tag leaves out what the component does by default', () => {
  assert.equal(snippet({ ...DEFAULT_SETTINGS, align: 'left', lineSpacing: DEFAULT_SETTINGS.fontSize / 5 }, false), '<PixelMorph text="morphing pixels" fontSize={90} />');
  assert.match(snippet({ ...DEFAULT_SETTINGS, text: 'say "hi"' }, true), /text=\{"say \\"hi\\""\}[\s\S]*cycle/);
});
