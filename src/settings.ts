import { fonts } from './font-catalog';
export { fonts } from './font-catalog';
/** Persisted choices that presets never replace. */
export interface Preferences {
  offset: number;
  showLyricsBeforeStart: boolean;
}

/** Values included when saving or applying a preset, regardless of the control location. */
export interface PresetSettings {
  useDuetColors: boolean;
  shadeHeight: number;
  shadeFadeStart: number;
  duetOutlineColor: string;
  duetOutlineWidth: number;
  fontSize: number;
  lineSpacing: number;
  bottom: number;
  horizontalMargin: number;
  height: number;
  shade: number;
  backgroundColor: string;
  textColor: string;
  duetColor: string;
  font: keyof typeof fonts;
  outlineColor: string;
  outlineWidth: number;
}
/** Flat data passed to the lyrics engine and retained in the v1 storage format. */
export type SettingsSnapshot = PresetSettings & Preferences;

export const preferenceDefaults: Preferences = { offset: 0, showLyricsBeforeStart: false };
export const presetDefaults: PresetSettings = {
  useDuetColors: false,
  shadeHeight: 34,
  shadeFadeStart: 15,
  duetOutlineColor: '#000000',
  duetOutlineWidth: 10,
  fontSize: 5,
  lineSpacing: 1,
  bottom: 0,
  horizontalMargin: 5,
  height: 25,
  shade: 70,
  backgroundColor: '#000000',
  textColor: '#ffffff',
  duetColor: '#ffffff',
  font: 'nunito',
  outlineColor: '#000000',
  outlineWidth: 10,
};
export const defaults: SettingsSnapshot = { ...presetDefaults, ...preferenceDefaults };

export function validateSettings(input: unknown): SettingsSnapshot {
  if (!input || typeof input !== 'object') throw new Error('Invalid export settings.');
  const s = input as SettingsSnapshot;
  for (const [key, min, max] of [
    ['fontSize', 1, 15],
    ['lineSpacing', 0.75, 1.5],
    ['bottom', 0, 80],
    ['horizontalMargin', 0, 40],
    ['height', 1, 100],
    ['shadeHeight', 0, 100],
    ['duetOutlineWidth', 0, 12],
    ['offset', -600000, 600000],
    ['shade', 0, 100],
    ['shadeFadeStart', 0, 100],
    ['outlineWidth', 0, 12],
  ] as const) {
    if (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max)
      throw new Error(`Invalid ${key}.`);
  }
  if (typeof s.useDuetColors !== 'boolean') throw new Error('Invalid useDuetColors.');
  if (typeof s.showLyricsBeforeStart !== 'boolean')
    throw new Error('Invalid showLyricsBeforeStart.');
  if (typeof s.font !== 'string' || !Object.hasOwn(fonts, s.font))
    throw new Error('Choose a supported font.');
  for (const color of [
    s.backgroundColor,
    s.textColor,
    s.duetColor,
    s.outlineColor,
    s.duetOutlineColor,
  ])
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      throw new Error('Choose a valid color.');
  return {
    backgroundColor: s.backgroundColor,
    useDuetColors: s.useDuetColors,
    shadeHeight: s.shadeHeight,
    shadeFadeStart: s.shadeFadeStart,
    duetOutlineColor: s.duetOutlineColor,
    duetOutlineWidth: s.duetOutlineWidth,
    showLyricsBeforeStart: s.showLyricsBeforeStart,
    fontSize: s.fontSize,
    lineSpacing: s.lineSpacing,
    bottom: s.bottom,
    horizontalMargin: s.horizontalMargin,
    height: s.height,
    offset: s.offset,
    shade: s.shade,
    textColor: s.textColor,
    duetColor: s.duetColor,
    font: s.font,
    outlineColor: s.outlineColor,
    outlineWidth: s.outlineWidth,
  };
}

/** Copy only preset fields, even when the input has source or runtime fields. */
export function pickPresetSettings(settings: PresetSettings): PresetSettings {
  return Object.fromEntries(
    (Object.keys(presetDefaults) as (keyof PresetSettings)[]).map((key) => [key, settings[key]]),
  ) as unknown as PresetSettings;
}
export function applyPresetSettings(
  current: SettingsSnapshot,
  appearance: PresetSettings,
): SettingsSnapshot {
  return { ...current, ...pickPresetSettings(appearance) };
}

/** The two persisted groups. SessionState is deliberately absent. */
export interface PersistedSettings {
  presetSettings: PresetSettings;
  preferences: Preferences;
}

export function pickPreferences(settings: Preferences): Preferences {
  return Object.fromEntries(
    (Object.keys(preferenceDefaults) as (keyof Preferences)[]).map((key) => [key, settings[key]]),
  ) as unknown as Preferences;
}

export function splitSettings(settings: SettingsSnapshot): PersistedSettings {
  return {
    presetSettings: pickPresetSettings(settings),
    preferences: pickPreferences(settings),
  };
}
