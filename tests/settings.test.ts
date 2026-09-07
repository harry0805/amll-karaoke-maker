import { expect, test } from 'bun:test';
import { defaults, validateSettings } from '../src/settings';

test('rejects invalid or unsupported export parameters', () => {
  expect(validateSettings(defaults)).toEqual(defaults);
  for (const change of [{ showLyricsBeforeStart: 'false' }, { showLyricsBeforeStart: null }, { offset: NaN }, { shade: 100 }, { fontSize: '4' }, { bottom: -1 }, { font: 'unknown' }, { font: 'toString' }, { textColor: 'url(example)' }, { outlineColor: null }, { outlineWidth: 13 }]) expect(() => validateSettings({ ...defaults, ...change })).toThrow();
  expect(() => validateSettings(null)).toThrow();
});
test('accepts an outline-free style and upgrades older export settings', () => {
  expect(validateSettings({ ...defaults, font: 'serif', outlineWidth: 0, textColor: '#FF0088' }).outlineWidth).toBe(0);
  const { showLyricsBeforeStart, textColor, duetColor, font, outlineColor, outlineWidth, ...old } = defaults;
  expect(validateSettings(old)).toEqual(defaults);
  expect(() => validateSettings({ ...defaults, duetColor: 'invalid' })).toThrow();
  expect(validateSettings({ ...defaults, duetColor: '#abcdef' }).duetColor).toBe('#abcdef');
});
