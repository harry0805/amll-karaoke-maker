export const fonts = {
  rounded: '"Arial Rounded MT Bold", "SF Pro Rounded", Arial, "PingFang SC", sans-serif',
  sans: 'Arial, "Helvetica Neue", "PingFang SC", sans-serif',
  condensed: 'Impact, "Arial Narrow", "PingFang SC", sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", serif',
} as const;
export interface Settings {
  fontSize: number; bottom: number; horizontalMargin: number; height: number; offset: number; shade: number; resolution: number; fps: number;
  textColor: string; duetColor: string; font: keyof typeof fonts; outlineColor: string; outlineWidth: number;
}
export const defaults: Settings = {
  fontSize: 5, bottom: 0, horizontalMargin: 4, height: 35, offset: 0, shade: 40, resolution: 1080, fps: 30,
  textColor: '#ffffff', duetColor: '#ffffff', font: 'rounded', outlineColor: '#000000', outlineWidth: 10,
};
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') throw new Error('Invalid export settings.');
  // Older export configurations get the new appearance defaults.
  const s = { horizontalMargin: defaults.horizontalMargin, textColor: defaults.textColor, duetColor: defaults.duetColor, font: defaults.font, outlineColor: defaults.outlineColor, outlineWidth: defaults.outlineWidth, ...input } as Settings;
  for (const [key, min, max] of [['fontSize', 2, 8], ['bottom', 0, 20], ['horizontalMargin', 0, 30], ['height', 20, 50], ['offset', -600000, 600000], ['shade', 0, 80], ['outlineWidth', 0, 12]] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max) throw new Error(`Invalid ${key}.`);
  }
  if (![720, 1080, 2160].includes(s.resolution) || ![24, 30, 60].includes(s.fps)) throw new Error('Invalid resolution or frame rate.');
  if (typeof s.font !== 'string' || !Object.hasOwn(fonts, s.font)) throw new Error('Choose a supported font.');
  for (const color of [s.textColor, s.duetColor, s.outlineColor]) if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid color.');
  return { fontSize: s.fontSize, bottom: s.bottom, horizontalMargin: s.horizontalMargin, height: s.height, offset: s.offset, shade: s.shade, resolution: s.resolution, fps: s.fps, textColor: s.textColor, duetColor: s.duetColor, font: s.font, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth };
}
export function outputSize(width: number, height: number, resolution: number) {
  const scale = Math.min(1, resolution / Math.min(width, height));
  return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) };
}
