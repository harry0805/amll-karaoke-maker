import { expect, test } from 'bun:test';
import { defaults, validateSettings } from '../src/settings';

test('rejects invalid or unsupported export parameters', () => {
  expect(validateSettings(defaults)).toEqual(defaults);
  for (const change of [{ showLyricsBeforeStart: 'false' }, { showLyricsBeforeStart: null }, { offset: NaN }, { shade: 101 }, { fontSize: '4' }, { bottom: -1 }, { font: 'unknown' }, { font: 'toString' }, { textColor: 'url(example)' }, { outlineColor: null }, { backgroundColor: 'invalid' }, { backgroundColor: null }, { outlineWidth: 13 }]) expect(() => validateSettings({ ...defaults, ...change })).toThrow();
  expect(() => validateSettings(null)).toThrow();
});
test('accepts an outline-free style and requires complete settings', () => {
  expect(validateSettings({ ...defaults, font: 'serif', outlineWidth: 0, textColor: '#FF0088' }).outlineWidth).toBe(0);
  const { showLyricsBeforeStart, textColor, duetColor, font, outlineColor, outlineWidth, ...old } = defaults;
  expect(() => validateSettings(old)).toThrow();
  expect(() => validateSettings({ ...defaults, duetColor: 'invalid' })).toThrow();
  expect(validateSettings({ ...defaults, duetColor: '#abcdef' }).duetColor).toBe('#abcdef');
});

test('new appearance ranges validate boundaries and duet settings', () => {
 for (const [key, min, max] of [['fontSize',1,15],['lineSpacing',.75,1.5],['bottom',0,80],['horizontalMargin',0,40],['height',1,100],['shadeHeight',0,100],['shade',0,100],['shadeFadeStart',0,100],['duetOutlineWidth',0,12]] as const) {
  expect(validateSettings({...defaults,[key]:min})[key]).toBe(min);
  expect(validateSettings({...defaults,[key]:max})[key]).toBe(max);
  expect(() => validateSettings({...defaults,[key]:max+1})).toThrow();
  expect(() => validateSettings({...defaults,[key]:min-1})).toThrow();
 }
 expect(() => validateSettings({...defaults,useDuetColors:'yes'})).toThrow();
 expect(() => validateSettings({...defaults,duetOutlineColor:'bad'})).toThrow();
});
