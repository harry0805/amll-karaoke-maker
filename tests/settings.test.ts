import { expect, test } from 'bun:test';
import { defaults, outputSize, validateSettings } from '../src/settings';

test('keeps aspect ratio, never upscales, and produces even dimensions', () => {
  expect(outputSize(3840, 2160, 1080)).toEqual({ width: 1920, height: 1080 });
  expect(outputSize(2160, 3840, 720)).toEqual({ width: 720, height: 1280 });
  expect(outputSize(640, 360, 1080)).toEqual({ width: 640, height: 360 });
  expect(outputSize(853, 479, 1080)).toEqual({ width: 854, height: 480 });
});
test('rejects invalid or unsupported export parameters', () => {
  expect(validateSettings(defaults)).toEqual(defaults);
  for (const change of [{ fps: 120 }, { resolution: 0 }, { offset: NaN }, { shade: 100 }, { fontSize: '4' }, { bottom: -1 }]) expect(() => validateSettings({ ...defaults, ...change })).toThrow();
  expect(() => validateSettings(null)).toThrow();
});
