import { expect, test } from 'bun:test';
import { fonts, bundledFamilies, validateFontFile } from '../src/font-catalog';
import { defaults, validateSettings } from '../src/settings';
import { parsePresets, serializePresets } from '../src/presets';

test('Nunito is the default and every font choice is valid', () => {
  expect(defaults.font).toBe('nunito');
  expect(fonts.rounded).toBe(
    '"Arial Rounded MT Bold", "SF Pro Rounded", Arial, "PingFang SC", sans-serif',
  );
  for (const font of Object.keys(fonts) as Array<keyof typeof fonts>)
    expect(validateSettings({ ...defaults, font }).font).toBe(font);
  expect(Object.keys(bundledFamilies)).toHaveLength(4);
});

test('upload validation rejects mislabeled files and allows supported font containers', () => {
  for (const [name, signature] of [
    ['a.ttf', 0x00010000],
    ['a.otf', 0x4f54544f],
    ['a.woff', 0x774f4646],
    ['a.WOFF2', 0x774f4632],
  ] as const) {
    const bytes = new ArrayBuffer(4);
    new DataView(bytes).setUint32(0, signature);
    expect(() => validateFontFile(name, bytes)).not.toThrow();
  }
  expect(() => validateFontFile('bad.ttf', new ArrayBuffer(4))).toThrow();
  expect(() => validateFontFile('font.exe', new ArrayBuffer(4))).toThrow();
  expect(() => validateFontFile('font.ttf', new ArrayBuffer(0))).toThrow();
  expect(() => validateFontFile('font.ttf', new ArrayBuffer(32 * 1024 * 1024 + 1))).toThrow();
});

test('custom selection round-trips without font bytes or filenames in presets', () => {
  const file = serializePresets([
    {
      name: 'Custom',
      settings: {
        ...defaults,
        font: 'custom',
        fontFile: 'private-font.ttf',
        fontBytes: 'secret-data',
      } as typeof defaults,
    },
  ]);
  expect(parsePresets(file)[0]!.settings.font).toBe('custom');
  expect(file).not.toContain('private-font');
  expect(file).not.toContain('secret-data');
  expect(file).not.toContain('fontFile');
});
