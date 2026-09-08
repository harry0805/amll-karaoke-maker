import { expect, test } from 'bun:test';
import { defaults, pickPresetSettings, applyPresetSettings } from '../src/settings';
import {
  parsePresets,
  serializePresets,
  mergePresets,
  parseStoredPresets,
  serializeStoredPresets,
} from '../src/presets';

test('presets round-trip appearance and exclude source timing', () => {
  const settings = {
    ...defaults,
    offset: 4200,
    showLyricsBeforeStart: true,
    font: 'serif' as const,
    duetColor: '#ffaa00',
    useDuetColors: true,
    duetOutlineColor: '#ff0088',
    duetOutlineWidth: 6,
    shadeHeight: 72,
    shade: 100,
    shadeFadeStart: 35,
    backgroundColor: '#123abc',
  };
  const [preset] = parsePresets(serializePresets([{ name: 'Duet', settings }]));
  expect(preset!.name).toBe('Duet');
  expect(preset!.settings).toEqual(pickPresetSettings(settings));
  expect(preset!.settings).not.toHaveProperty('offset');
  expect(preset!.settings).not.toHaveProperty('showLyricsBeforeStart');
  expect(
    applyPresetSettings(
      { ...defaults, offset: 900, showLyricsBeforeStart: true },
      preset!.settings,
    ),
  ).toEqual({ ...settings, offset: 900 });
});
test('invalid imports are rejected as a whole', () => {
  const valid = JSON.parse(serializePresets([{ name: 'Valid', settings: defaults }]));
  for (const data of [
    { ...valid, version: 2 },
    { ...valid, format: 'other' },
    { ...valid, presets: [] },
    {
      ...valid,
      presets: [...valid.presets, { name: 'Bad', settings: { ...defaults, offset: '10' } }],
    },
    { ...valid, presets: [{ name: ' ', settings: defaults }] },
  ])
    expect(() => parsePresets(JSON.stringify(data))).toThrow();
  expect(() => parsePresets('x'.repeat(1024 * 1024 + 1))).toThrow();
});
test('imports preserve existing names and settings when names collide', () => {
  const existing = parsePresets(serializePresets([{ name: 'Duet', settings: defaults }]));
  const incoming = parsePresets(
    serializePresets([
      { name: 'duet', settings: { ...defaults, fontSize: 10 } },
      { name: 'duet', settings: defaults },
    ]),
  );
  const merged = mergePresets(existing, incoming);
  expect(merged.map((p) => p.name)).toEqual(['Duet', 'duet', 'duet']);
  expect(merged[0]).toEqual(existing[0]);
  expect(merged[1]!.settings.fontSize).toBe(10);
  expect(existing).toHaveLength(1);
});

test('local IDs survive reloads and distinguish identical names', () => {
  const presets = parsePresets(
    serializePresets([
      { name: 'Same', settings: defaults },
      { name: 'Same', settings: { ...defaults, fontSize: 10 } },
    ]),
  );
  expect(presets[0]!.id).not.toBe(presets[1]!.id);
  expect(parseStoredPresets(serializeStoredPresets(presets))).toEqual(presets);
  expect(parseStoredPresets(serializeStoredPresets([]))).toEqual([]);
  expect(() => parseStoredPresets(serializeStoredPresets([presets[0]!, presets[0]!]))).toThrow(
    'Invalid saved preset ID',
  );
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

test('merges resolve ID collisions only', () => {
  const migrated = parsePresets(serializePresets([{ name: 'Same', settings: defaults }]));
  expect(parseStoredPresets(serializeStoredPresets(migrated))).toEqual(migrated);
  const merged = mergePresets(migrated, migrated);
  expect(merged.map((p) => p.name)).toEqual(['Same', 'Same']);
  expect(merged[0]!.id).not.toBe(merged[1]!.id);
});

import { presetLabel } from '../src/presets';
test('selected preset labels reflect changes and revert when settings match', () => {
  const sourceChanged = { ...defaults, offset: 500, showLyricsBeforeStart: true };
  expect(presetLabel('Default', defaults, sourceChanged)).toBe('Default');
  expect(presetLabel('Duet', defaults, { ...defaults, duetColor: '#ffaa00' })).toBe(
    'Duet (Modified)',
  );
  expect(presetLabel('Duet', defaults, { ...defaults })).toBe('Duet');
  expect(presetLabel('Duet', pickPresetSettings(defaults), sourceChanged)).toBe('Duet');
});

test('malformed JSON imports have an actionable error', () => {
  expect(() => parsePresets('{broken')).toThrow(
    'This file is not valid JSON. Choose a preset exported from Karaoke Maker.',
  );
  expect(() => parsePresets('null')).toThrow('Choose a Karaoke Maker preset file.');
});

test('applying appearance ignores extra source and runtime fields', () => {
  const current = { ...defaults, offset: 1200, showLyricsBeforeStart: true };
  const incoming = { ...defaults, fontSize: 8, exporting: true };
  const applied = applyPresetSettings(current, incoming);
  expect(applied.offset).toBe(1200);
  expect(applied.showLyricsBeforeStart).toBe(true);
  expect(applied.fontSize).toBe(8);
  expect(applied).not.toHaveProperty('exporting');
  expect(pickPresetSettings(incoming)).not.toHaveProperty('exporting');
});
