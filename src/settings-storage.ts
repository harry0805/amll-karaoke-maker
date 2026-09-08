import { validateSettings, splitSettings, type PersistedSettings } from './settings';

// Keep the v1 flat payload so existing browser settings remain readable.
export const CURRENT_SETTINGS_KEY = 'karaoke-studio.settings.v1';

export function restoreCurrentSettings(
  session: Pick<Storage, 'getItem' | 'setItem'>,
  local: Pick<Storage, 'getItem'>,
): PersistedSettings | undefined {
  for (const storage of [session, local]) {
    try {
      const text = storage.getItem(CURRENT_SETTINGS_KEY);
      if (!text) continue;
      const settings = validateSettings(JSON.parse(text));
      // Seed this tab once. Other tabs updating local storage must not replace it.
      if (storage !== session) {
        try {
          session.setItem(CURRENT_SETTINGS_KEY, JSON.stringify(settings));
        } catch {
          /* Still restore the local settings. */
        }
      }
      return splitSettings(settings);
    } catch {
      /* Try local storage if the session entry is invalid. */
    }
  }
  return undefined;
}
export function persistCurrentSettings(
  settings: PersistedSettings,
  session: Pick<Storage, 'setItem'>,
  local: Pick<Storage, 'setItem'>,
) {
  const text = JSON.stringify(
    validateSettings({ ...settings.presetSettings, ...settings.preferences }),
  );
  let failed = false;
  for (const storage of [session, local]) {
    try {
      storage.setItem(CURRENT_SETTINGS_KEY, text);
    } catch {
      failed = true;
    }
  }
  if (failed)
    throw new Error(
      'Some browser storage is unavailable. Settings may not survive closing this tab.',
    );
}
