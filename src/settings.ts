export const fonts = {
  rounded: '"Arial Rounded MT Bold", "SF Pro Rounded", Arial, "PingFang SC", sans-serif',
  sans: 'Arial, "Helvetica Neue", "PingFang SC", sans-serif',
  condensed: 'Impact, "Arial Narrow", "PingFang SC", sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", serif',
} as const;
export interface Settings {
  showLyricsBeforeStart: boolean;
  useDuetColors: boolean; shadeHeight: number; shadeFadeStart: number; duetOutlineColor: string; duetOutlineWidth: number;
  fontSize: number; lineSpacing: number; bottom: number; horizontalMargin: number; height: number; offset: number; shade: number;
  backgroundColor: string; textColor: string; duetColor: string; font: keyof typeof fonts; outlineColor: string; outlineWidth: number;
}
export const defaults: Settings = {
  showLyricsBeforeStart: false,
  useDuetColors: false, shadeHeight: 34, shadeFadeStart: 15, duetOutlineColor: '#000000', duetOutlineWidth: 10,
  fontSize: 5, lineSpacing: 1, bottom: 0, horizontalMargin: 5, height: 25, offset: 0, shade: 70,
  backgroundColor: '#000000', textColor: '#ffffff', duetColor: '#ffffff', font: 'rounded', outlineColor: '#000000', outlineWidth: 10,
};
export function validateSettings(input: unknown): Settings {
  if (!input || typeof input !== 'object') throw new Error('Invalid export settings.');
  const s = input as Settings;
  for (const [key, min, max] of [['fontSize', 1, 15], ['lineSpacing', 0.75, 1.5], ['bottom', 0, 80], ['horizontalMargin', 0, 40], ['height', 1, 100], ['shadeHeight', 0, 100], ['duetOutlineWidth', 0, 12], ['offset', -600000, 600000], ['shade', 0, 100], ['shadeFadeStart', 0, 100], ['outlineWidth', 0, 12]] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max) throw new Error(`Invalid ${key}.`);
  }
  if (typeof s.useDuetColors !== 'boolean') throw new Error('Invalid useDuetColors.');
  if (typeof s.showLyricsBeforeStart !== 'boolean') throw new Error('Invalid showLyricsBeforeStart.');
  if (typeof s.font !== 'string' || !Object.hasOwn(fonts, s.font)) throw new Error('Choose a supported font.');
  for (const color of [s.backgroundColor, s.textColor, s.duetColor, s.outlineColor, s.duetOutlineColor]) if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a valid color.');
  return { backgroundColor: s.backgroundColor, useDuetColors: s.useDuetColors, shadeHeight: s.shadeHeight, shadeFadeStart: s.shadeFadeStart, duetOutlineColor: s.duetOutlineColor, duetOutlineWidth: s.duetOutlineWidth, showLyricsBeforeStart: s.showLyricsBeforeStart, fontSize: s.fontSize, lineSpacing: s.lineSpacing, bottom: s.bottom, horizontalMargin: s.horizontalMargin, height: s.height, offset: s.offset, shade: s.shade, textColor: s.textColor, duetColor: s.duetColor, font: s.font, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth };
}

export type PresetSettings = Omit<Settings, 'offset' | 'showLyricsBeforeStart'>;
export function appearanceSettings(settings: Settings): PresetSettings {
  const { offset, showLyricsBeforeStart, ...appearance } = settings;
  return appearance;
}
export function applyAppearance(current: Settings, appearance: PresetSettings): Settings {
  return { ...appearance, offset: current.offset, showLyricsBeforeStart: current.showLyricsBeforeStart };
}
