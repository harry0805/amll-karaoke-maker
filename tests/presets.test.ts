import { expect, test } from 'bun:test';
import { defaults } from '../src/settings';
import { parsePresets, serializePresets, mergePresets, parseStoredPresets, serializeStoredPresets } from '../src/presets';

test('preset files round-trip all settings, including offset and boolean flags', () => {
  const settings = { ...defaults, offset: 4200, showLyricsBeforeStart: true, font: 'serif' as const, duetColor: '#ffaa00' };
  const [preset] = parsePresets(serializePresets([{ name: 'Duet', settings }]));
  expect(preset!.name).toBe('Duet');
  expect(preset!.settings).toEqual(settings);
});
test('invalid imports are rejected as a whole', () => {
  const valid = JSON.parse(serializePresets([{ name: 'Valid', settings: defaults }]));
  for (const data of [{ ...valid, version: 2 }, { ...valid, format: 'other' }, { ...valid, presets: [] }, { ...valid, presets: [...valid.presets, { name: 'Bad', settings: { ...defaults, offset: '10' } }] }, { ...valid, presets: [{ name: ' ', settings: defaults }] }]) expect(() => parsePresets(JSON.stringify(data))).toThrow();
  expect(() => parsePresets('x'.repeat(1024 * 1024 + 1))).toThrow();
});
test('imports preserve existing names and settings when names collide', () => {
  const existing = parsePresets(serializePresets([{ name: 'Duet', settings: defaults }]));
  const incoming = parsePresets(serializePresets([{ name: 'duet', settings: { ...defaults, offset: 100 } }, { name: 'duet', settings: defaults }]));
  const merged = mergePresets(existing, incoming);
  expect(merged.map(p => p.name)).toEqual(['Duet', 'duet', 'duet']);
  expect(merged[0]).toEqual(existing[0]);
  expect(merged[1]!.settings.offset).toBe(100);
  expect(existing).toHaveLength(1);
});

test('local IDs survive reloads and distinguish identical names', () => {
  const presets = parsePresets(serializePresets([{ name: 'Same', settings: defaults }, { name: 'Same', settings: { ...defaults, offset: 100 } }]));
  expect(presets[0]!.id).not.toBe(presets[1]!.id);
  expect(parseStoredPresets(serializeStoredPresets(presets))).toEqual(presets);
  expect(parseStoredPresets(serializeStoredPresets([]))).toEqual([]);
  expect(() => parseStoredPresets(serializeStoredPresets([presets[0]!, presets[0]!]))).toThrow('Invalid saved preset ID');
});

test('exports exclude identity and every import creates fresh IDs even if supplied', () => {
  const original = parsePresets(serializePresets([{ name: 'Default', settings: defaults }]));
  const exported = serializePresets(original);
  expect(JSON.parse(exported).presets[0]).not.toHaveProperty('id');
  const data = JSON.parse(exported);
  data.presets[0].id = original[0]!.id;
  const first = parsePresets(JSON.stringify(data));
  const second = parsePresets(JSON.stringify(data));
  expect(new Set([original[0]!.id, first[0]!.id, second[0]!.id]).size).toBe(3);
  expect(first[0]!.name).toBe('Default');
});

test('legacy libraries migrate to persistent IDs and merges resolve ID collisions only', () => {
  const legacy = serializePresets([{ name: 'Same', settings: defaults }]);
  const migrated = parseStoredPresets(legacy);
  expect(parseStoredPresets(serializeStoredPresets(migrated))).toEqual(migrated);
  const merged = mergePresets(migrated, migrated);
  expect(merged.map(p => p.name)).toEqual(['Same', 'Same']);
  expect(merged[0]!.id).not.toBe(merged[1]!.id);
});

import { CURRENT_SETTINGS_KEY, restoreCurrentSettings, persistCurrentSettings } from '../src/presets';
function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test('session settings remain independent while new sessions inherit the last local update', () => {
  const local = memoryStorage(), first = memoryStorage(), second = memoryStorage();
  persistCurrentSettings({ ...defaults, offset: 100 }, first, local);
  expect(restoreCurrentSettings(second, local)!.offset).toBe(100);
  persistCurrentSettings({ ...defaults, offset: 200 }, first, local);
  expect(restoreCurrentSettings(second, local)!.offset).toBe(100);
  expect(restoreCurrentSettings(first, local)!.offset).toBe(200);
  expect(restoreCurrentSettings(memoryStorage(), local)!.offset).toBe(200);
});
test('invalid session data falls back to local, and storage failures do not prevent the other write', () => {
  const local = memoryStorage(), session = memoryStorage();
  persistCurrentSettings(defaults, session, local);
  session.setItem(CURRENT_SETTINGS_KEY, 'broken');
  expect(restoreCurrentSettings(session, local)).toEqual(defaults);
  const broken = { setItem() { throw new Error('quota'); } };
  expect(() => persistCurrentSettings({ ...defaults, offset: 300 }, broken, local)).toThrow();
  expect(restoreCurrentSettings(memoryStorage(), local)!.offset).toBe(300);
});

import { presetLabel } from '../src/presets';
test('selected preset labels reflect changes and revert when settings match', () => {
  expect(presetLabel('Default', defaults, { ...defaults, offset: 500 })).toBe('Default (Modified)');
  expect(presetLabel('Duet', defaults, { ...defaults, duetColor: '#ffaa00' })).toBe('Duet (Modified)');
  expect(presetLabel('Duet', defaults, { ...defaults })).toBe('Duet');
  expect(presetLabel('Duet', { ...defaults, offset: 500 }, { ...defaults, offset: 500 })).toBe('Duet');
});

test('malformed JSON imports have an actionable error', () => {
  expect(() => parsePresets('{broken')).toThrow('This file is not valid JSON. Choose a preset exported from Karaoke studio.');
  expect(() => parsePresets('null')).toThrow('Choose a Karaoke studio preset file.');
});
