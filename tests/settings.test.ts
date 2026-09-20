import { expect, test } from 'bun:test';
import { defaults, validateSettings } from '../src/settings';

test('rejects invalid or unsupported export parameters', () => {
  expect(validateSettings(defaults)).toEqual(defaults);
  for (const change of [
    { showLyricsBeforeStart: 'false' },
    { showLyricsBeforeStart: null },
    { offset: NaN },
    { shade: 101 },
    { fontSize: '4' },
    { bottom: -1 },
    { font: 'unknown' },
    { font: 'toString' },
    { textColor: 'url(example)' },
    { outlineColor: null },
    { backgroundColor: 'invalid' },
    { backgroundColor: null },
    { outlineWidth: 13 },
  ])
    expect(() => validateSettings({ ...defaults, ...change })).toThrow();
  expect(() => validateSettings(null)).toThrow();
});
test('accepts an outline-free style and requires complete settings', () => {
  expect(
    validateSettings({ ...defaults, font: 'serif', outlineWidth: 0, textColor: '#FF0088' })
      .outlineWidth,
  ).toBe(0);
  for (const key of Object.keys(defaults)) {
    if (key === 'visibleLines') continue;
    const incomplete = { ...defaults } as Partial<typeof defaults>;
    delete incomplete[key as keyof typeof defaults];
    expect(() => validateSettings(incomplete)).toThrow();
  }
  expect(() => validateSettings({ ...defaults, duetColor: 'invalid' })).toThrow();
  expect(validateSettings({ ...defaults, duetColor: '#abcdef' }).duetColor).toBe('#abcdef');
});

test('line limits validate and older v1 settings receive the new defaults', () => {
  const legacy: Partial<typeof defaults> = { ...defaults };
  delete legacy.visibleLines;
  expect(validateSettings(legacy)).toEqual(defaults);
  expect(validateSettings({ ...defaults, visibleLines: 0 }).visibleLines).toBe(0);
  expect(validateSettings({ ...defaults, flexibleLyricArea: false })).toEqual(defaults);
  for (const value of [-1, 21, 1.5, NaN, null, '2', undefined])
    expect(() => validateSettings({ ...defaults, visibleLines: value })).toThrow();
});

test('new appearance ranges validate boundaries and duet settings', () => {
  for (const [key, min, max] of [
    ['fontSize', 1, 15],
    ['lineSpacing', 0.75, 1.5],
    ['bottom', 0, 80],
    ['horizontalMargin', 0, 40],
    ['height', 0, 100],
    ['shadeHeight', 0, 100],
    ['shade', 0, 100],
    ['shadeFadeStart', 0, 100],
    ['duetOutlineWidth', 0, 12],
  ] as const) {
    expect(validateSettings({ ...defaults, [key]: min })[key]).toBe(min);
    expect(validateSettings({ ...defaults, [key]: max })[key]).toBe(max);
    expect(() => validateSettings({ ...defaults, [key]: max + 1 })).toThrow();
    expect(() => validateSettings({ ...defaults, [key]: min - 1 })).toThrow();
  }
  expect(() => validateSettings({ ...defaults, useDuetColors: 'yes' })).toThrow();
  expect(() => validateSettings({ ...defaults, duetOutlineColor: 'bad' })).toThrow();
});
