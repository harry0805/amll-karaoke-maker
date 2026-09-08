import { expect, test } from 'bun:test';
import { defaults, splitSettings } from '../src/settings';
import {
  CURRENT_SETTINGS_KEY,
  restoreCurrentSettings,
  persistCurrentSettings,
} from '../src/settings-storage';
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
test('session settings remain independent while new sessions inherit the last local update', () => {
  const local = memoryStorage(),
    first = memoryStorage(),
    second = memoryStorage();
  persistCurrentSettings(splitSettings({ ...defaults, offset: 100 }), first, local);
  expect(restoreCurrentSettings(second, local)!.preferences.offset).toBe(100);
  persistCurrentSettings(splitSettings({ ...defaults, offset: 200 }), first, local);
  expect(restoreCurrentSettings(second, local)!.preferences.offset).toBe(100);
  expect(restoreCurrentSettings(first, local)!.preferences.offset).toBe(200);
  expect(restoreCurrentSettings(memoryStorage(), local)!.preferences.offset).toBe(200);
});
test('invalid session data falls back to local, and storage failures do not prevent the other write', () => {
  const local = memoryStorage(),
    session = memoryStorage();
  persistCurrentSettings(splitSettings(defaults), session, local);
  session.setItem(CURRENT_SETTINGS_KEY, 'broken');
  expect(restoreCurrentSettings(session, local)).toEqual(splitSettings(defaults));
  const broken = {
    setItem() {
      throw new Error('quota');
    },
  };
  expect(() =>
    persistCurrentSettings(splitSettings({ ...defaults, offset: 300 }), broken, local),
  ).toThrow();
  expect(restoreCurrentSettings(memoryStorage(), local)!.preferences.offset).toBe(300);
});

test('storage saves source and appearance but excludes runtime fields', () => {
  const session = memoryStorage();
  const local = memoryStorage();
  const current = {
    ...defaults,
    offset: 1200,
    showLyricsBeforeStart: true,
    fontSize: 8,
    exporting: true,
  };
  persistCurrentSettings(splitSettings(current), session, local);
  const restored = restoreCurrentSettings(session, local);
  expect(restored).toEqual(
    splitSettings({ ...defaults, offset: 1200, showLyricsBeforeStart: true, fontSize: 8 }),
  );
  expect(restored).not.toHaveProperty('exporting');
});

test('storage accepts studio groups but never saves session state', () => {
  const local = memoryStorage();
  const session = memoryStorage();
  const state = {
    ...splitSettings({ ...defaults, offset: 400, fontSize: 7 }),
    session: { exporting: true, progress: 0.5 },
  };
  persistCurrentSettings(state, session, local);
  const saved = JSON.parse(local.getItem(CURRENT_SETTINGS_KEY)!);
  expect(saved).toEqual({ ...defaults, offset: 400, fontSize: 7 });
  expect(saved).not.toHaveProperty('session');
  expect(restoreCurrentSettings(session, local)).toEqual(splitSettings(saved));
});
