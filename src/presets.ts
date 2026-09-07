import { defaults, appearanceSettings, validateSettings, type PresetSettings, type Settings } from './settings';

export interface Preset { id: string; name: string; settings: PresetSettings }
export const CURRENT_SETTINGS_KEY = 'karaoke-studio.settings.v1';
export const PRESETS_KEY = 'karaoke-studio.presets.v1';
const FORMAT = 'karaoke-studio-presets';
const STORAGE_FORMAT = 'karaoke-studio-preset-library';
export const MAX_PRESETS = 100;
export function presetName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new Error('Enter a preset name between 1 and 80 characters.');
  return value.trim();
}
export function serializePresets(presets: Pick<Preset, 'name' | 'settings'>[]): string {
  return JSON.stringify({ format: FORMAT, version: 1, presets: presets.map(p => ({ name: presetName(p.name), settings: validatePresetSettings(p.settings) })) }, null, 2);
}
export function parsePresets(text: string): Preset[] {
  if (text.length > 1024 * 1024) throw new Error('Preset files must be smaller than 1 MB.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a preset exported from Karaoke studio.'); }
  if (!data || typeof data !== 'object') throw new Error('Choose a Karaoke studio preset file.');
  const document = data as { format?: unknown; version?: unknown; presets?: unknown };

  if (document.format !== FORMAT || document.version !== 1 || !Array.isArray(document.presets) || !document.presets.length || document.presets.length > MAX_PRESETS) throw new Error('Choose a version 1 Karaoke studio preset file containing 1 to 100 presets.');
  return document.presets.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Each preset needs a name and settings.');
    const preset = entry as { name?: unknown; settings?: unknown };
    return { id: crypto.randomUUID(), name: presetName(preset.name), settings: validatePresetSettings(preset.settings) };
  });
}
export function mergePresets(existing: Preset[], incoming: Preset[]): Preset[] {
  if (existing.length + incoming.length > MAX_PRESETS) throw new Error('You can store up to 100 presets. Delete some before importing more.');
  const ids = new Set(existing.map(p => p.id));
  return [...existing, ...incoming.map(p => {
    let id = p.id;
    while (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    return { ...p, id };
  })];
}

// Local identity is persisted only in the browser library, never in portable files.
export function serializeStoredPresets(presets: Preset[]): string {
  return JSON.stringify({ format: STORAGE_FORMAT, version: 1, presets: presets.map(p => ({ ...p, settings: validatePresetSettings(p.settings) })) });
}

export function parseStoredPresets(text: string): Preset[] {
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !Array.isArray(data.presets) || data.presets.length > MAX_PRESETS) throw new Error('Invalid saved preset library.');
  if (data.format !== STORAGE_FORMAT) throw new Error('Invalid saved preset library.');
  const ids = new Set<string>();
  return data.presets.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid saved preset.');
    const preset = entry as Partial<Preset>;
    if (typeof preset.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preset.id) || ids.has(preset.id)) throw new Error('Invalid saved preset ID.');
    ids.add(preset.id);
    return { id: preset.id, name: presetName(preset.name), settings: validatePresetSettings(preset.settings) };
  });
}

export function restoreCurrentSettings(session: Pick<Storage, 'getItem' | 'setItem'>, local: Pick<Storage, 'getItem'>): Settings | undefined {
  for (const storage of [session, local]) {
    try {
      const text = storage.getItem(CURRENT_SETTINGS_KEY);
      if (!text) continue;
      const settings = validateSettings(JSON.parse(text));
      // Seed this tab once. Other tabs updating local storage must not replace it.
      if (storage !== session) {
        try { session.setItem(CURRENT_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Still restore the local settings. */ }
      }
      return settings;
    } catch { /* Try local storage if the session entry is invalid. */ }
  }
  return undefined;
}
export function persistCurrentSettings(settings: Settings, session: Pick<Storage, 'setItem'>, local: Pick<Storage, 'setItem'>) {
  const text = JSON.stringify(validateSettings(settings));
  let failed = false;
  for (const storage of [session, local]) {
    try { storage.setItem(CURRENT_SETTINGS_KEY, text); } catch { failed = true; }
  }
  if (failed) throw new Error('Some browser storage is unavailable. Settings may not survive closing this tab.');
}

export function presetLabel(name: string, saved: PresetSettings, current: Settings): string {
  const modified = (Object.keys(appearanceSettings(current)) as (keyof PresetSettings)[]).some(key => saved[key] !== current[key]);
  return name + (modified ? ' (Modified)' : '');
}

function validatePresetSettings(input: unknown): PresetSettings {
  if (!input || typeof input !== 'object') throw new Error('Invalid preset settings.');
  return appearanceSettings(validateSettings({ offset: defaults.offset, showLyricsBeforeStart: defaults.showLyricsBeforeStart, ...input }));
}
