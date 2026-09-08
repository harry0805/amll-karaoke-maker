import { defaults, pickPresetSettings, validateSettings, type PresetSettings } from './settings';

export interface Preset {
  id: string;
  name: string;
  settings: PresetSettings;
}
const FORMAT = 'karaoke-studio-presets';
const STORAGE_FORMAT = 'karaoke-studio-preset-library';
export const MAX_PRESETS = 100;
export function presetName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80)
    throw new Error('Enter a preset name between 1 and 80 characters.');
  return value.trim();
}
export function serializePresets(presets: Pick<Preset, 'name' | 'settings'>[]): string {
  return JSON.stringify(
    {
      format: FORMAT,
      version: 1,
      presets: presets.map((p) => ({
        name: presetName(p.name),
        settings: validatePresetSettings(p.settings),
      })),
    },
    null,
    2,
  );
}
export function parsePresets(text: string): Preset[] {
  if (text.length > 1024 * 1024) throw new Error('Preset files must be smaller than 1 MB.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Choose a preset exported from Karaoke Maker.');
  }
  if (!data || typeof data !== 'object') throw new Error('Choose a Karaoke Maker preset file.');
  const document = data as { format?: unknown; version?: unknown; presets?: unknown };

  if (
    document.format !== FORMAT ||
    document.version !== 1 ||
    !Array.isArray(document.presets) ||
    !document.presets.length ||
    document.presets.length > MAX_PRESETS
  )
    throw new Error('Choose a version 1 Karaoke Maker preset file containing 1 to 100 presets.');
  return document.presets.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object')
      throw new Error('Each preset needs a name and settings.');
    const preset = entry as { name?: unknown; settings?: unknown };
    return {
      id: crypto.randomUUID(),
      name: presetName(preset.name),
      settings: validatePresetSettings(preset.settings),
    };
  });
}
export function mergePresets(existing: Preset[], incoming: Preset[]): Preset[] {
  if (existing.length + incoming.length > MAX_PRESETS)
    throw new Error('You can store up to 100 presets. Delete some before importing more.');
  const ids = new Set(existing.map((p) => p.id));
  return [
    ...existing,
    ...incoming.map((p) => {
      let id = p.id;
      while (ids.has(id)) id = crypto.randomUUID();
      ids.add(id);
      return { ...p, id };
    }),
  ];
}

// Local identity is persisted only in the browser library, never in portable files.
export function serializeStoredPresets(presets: Preset[]): string {
  return JSON.stringify({
    format: STORAGE_FORMAT,
    version: 1,
    presets: presets.map((p) => ({ ...p, settings: validatePresetSettings(p.settings) })),
  });
}

export function parseStoredPresets(text: string): Preset[] {
  const data = JSON.parse(text);
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.presets) ||
    data.presets.length > MAX_PRESETS
  )
    throw new Error('Invalid saved preset library.');
  if (data.format !== STORAGE_FORMAT) throw new Error('Invalid saved preset library.');
  const ids = new Set<string>();
  return data.presets.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid saved preset.');
    const preset = entry as Partial<Preset>;
    if (
      typeof preset.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(preset.id) ||
      ids.has(preset.id)
    )
      throw new Error('Invalid saved preset ID.');
    ids.add(preset.id);
    return {
      id: preset.id,
      name: presetName(preset.name),
      settings: validatePresetSettings(preset.settings),
    };
  });
}

export function presetLabel(name: string, saved: PresetSettings, current: PresetSettings): string {
  const modified = (Object.keys(pickPresetSettings(current)) as (keyof PresetSettings)[]).some(
    (key) => saved[key] !== current[key],
  );
  return name + (modified ? ' (Modified)' : '');
}

function validatePresetSettings(input: unknown): PresetSettings {
  if (!input || typeof input !== 'object') throw new Error('Invalid preset settings.');
  return pickPresetSettings(
    validateSettings({
      offset: defaults.offset,
      showLyricsBeforeStart: defaults.showLyricsBeforeStart,
      ...input,
    }),
  );
}
